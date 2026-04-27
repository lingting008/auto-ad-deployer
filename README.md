# 自动广告投放系统

把联盟平台上已批准的广告主 offer，自动同步到 Google Ads 创建搜索广告系列。

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        四步流水线                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① deploy      ② fill-sheet      ③ Apps Script      ④ bulk    │
│  (本地电脑)    (VPS 服务器)      (Google Sheets)    (Google Ads)│
│                                                                  │
│  联盟API        解析链接              按钮触发           MCC定时   │
│   ↓            + 抓关键词           HTTP转发             创建广告  │
│  Sheets        + AI生成文案                                ↓      │
│                                ┌──────────────────────────────┐ │
│                                │       Google Sheets           │ │
│                                │  (批量投放 / 历史总表 / 凭证)  │ │
│                                └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## 你需要的账号（全部免费）

| 所需账号 | 用途 | 申请难度 |
|---|---|---|
| Google Sheets | 数据中心 | 免费，注册就有 |
| Google Cloud（Service Account） | Sheets API 认证 | 免费，5分钟搞定 |
| Google Ads MCC 账号 | 投放广告 | 免费，你有 |
| 联盟平台账号（LinkHouse 等） | 获取 offer | 免费，注册就有 |
| AITDK API | 获取关键词 | 免费/付费 |
| LLM API（GPT/Gemini） | AI 生成文案 | 免费额度可用 |
| 住宅代理 | 解析链接跳转 | 付费 |

**不需要 Google Ads API** — bulk-manage 使用的是 Google Ads **内置 Scripts** 功能，免费使用，无需申请。

## 目录结构

```
auto-ad-deployer/
├── src/
│   ├── deploy/           脚本①：从联盟 API 拉取 offer 写入 Sheets
│   ├── fill-sheet/       脚本②：VPS HTTP 服务（解析+关键词+AI文案）
│   ├── apps-script/      脚本③：Google Apps Script（触发 fill-sheet）
│   ├── bulk-manage/      脚本④：Google Ads Scripts（创建/暂停广告）
│   └── lib/
│       ├── types.ts
│       ├── sheets/client.ts       Sheets API 封装
│       ├── affiliates/          联盟 API 适配器（LinkHouse / PeerFly / 通用）
│       └── utils/
│           ├── linkResolver.ts   链接解析（支持 JS/meta/form 跳转）
│           ├── keywordFetcher.ts 关键词获取（AITDK API）
│           └── adGenerator.ts   AI 广告文案生成
├── scripts/
│   └── setup-sheets.ts   创建 Sheets 模板
├── config/
│   ├── config.yaml.example
│   └── profiles/
│       └── user1.yaml.example
├── ecosystem.config.js    PM2 进程管理
└── README.md
```

## 快速开始

### 第一步：安装依赖

```bash
cd /Users/lingting/Desktop/自动上广告
npm install
```

### 第二步：配置 Google Cloud（免费）

1. 打开 [console.cloud.google.com](https://console.cloud.google.com)
2. 新建项目 → 开启 **Google Sheets API**
3. 「API 和服务」→「凭据」→「创建凭据」→「服务账号」
4. 下载 JSON 密钥文件 → 重命名为 `service-account.json` 放到 `config/` 目录
5. 用 Google Sheets 创建 3 张表（见第五步）
6. 把服务账号邮箱加到 Sheets「共享」→ 添加成员 → 编辑者权限

### 第三步：配置 config.yaml

```bash
cp config.yaml.example config.yaml
# 编辑 config.yaml 填入所有凭证
```

### 第四步：在 Sheets A 列预先填入 CID

在 Google Sheets「批量投放」表 A 列，手动填入你的 Google Ads 子账号 CID（格式 `123-456-7890`）。每行一个 CID，deploy 脚本会找有 CID 但 D 列为空的行来填入 offer。

### 第五步：创建 Sheets 模板

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./config/service-account.json
npm run sheets:setup -- --create
```

会创建 3 张表：**批量投放**、**offer历史总表**、**联盟凭证**。把输出的 Spreadsheet ID 填到 `config.yaml`。

### 第六步：运行 deploy（本地执行）

```bash
# 处理所有联盟
npm run deploy

# 只处理 LinkHouse
npm run deploy:lh

# 只打印，不写入
npm run deploy -- --dry-run
```

### 第七步：部署 fill-sheet 到 VPS

```bash
# 上传到 VPS
scp -r . root@YOUR_VPS:/opt/auto-ad/

# VPS 上
cd /opt/auto-ad
npm install
pm2 start ecosystem.config.js
pm2 save
```

### 第八步：配置 Apps Script

1. 打开 Google Sheets → 扩展程序 → Apps Script
2. 新建项目 → 删除默认代码 → 粘贴 `src/apps-script/Code.gs` 全部内容
3. 修改顶部的 `SERVER_URL`（VPS IP:端口）和 `SERVER_API_KEY`
4. 部署 → 新建部署 → Web App → 执行身份选「我」→ 访问权限「任何人」
5. 复制 Web App URL

### 第九步：触发 fill-sheet

刷新 Sheets 页面 → 点击顶部菜单「广告投放」→「一键填充」

### 第十步：人工审核

fill-sheet 完成后，G 列为 `review`（黄色高亮）。检查 AI 生成的标题/描述是否合理，确认无误后将 G 列改为 `create`（绿色）放行。

### 第十一步：Google Ads 脚本自动创建广告

1. 登录 Google Ads MCC 账号
2. 「批量操作」→「脚本」→ 新建
3. 粘贴 `src/bulk-manage/bulk-manage.js` 全部内容
4. 填入顶部的 `SPREADSHEET_ID`
5. 「预览」运行确认无误后，「创建定时」设为每小时执行

## Google Sheets 表结构

### 批量投放（主表）

| 列 | 名称 | 填写者 | 说明 |
|---|---|---|---|
| A | 账号ID | 手动预填 | Google Ads 子账号 CID |
| B | 官网 | fill-sheet | 落地页域名 |
| C | 广告系列名称 | fill-sheet | `lh-12345-10974-ad-AU` |
| D | 动态链接 | deploy | 联盟追踪链接 |
| E | 联盟名称 | deploy | `lh-12345-10974-ad` |
| F | 国家 | fill-sheet | `AU` |
| G | 状态 | 多脚本 | `create/review/success/error/pause` |
| H | URL后缀参数 | fill-sheet | 追踪参数 |
| I | 关键词 | fill-sheet | 最多5个，逗号分隔 |
| J | 标题 | fill-sheet | 15条，`\n` 分隔 |
| K | 描述 | fill-sheet | 4条，`\n` 分隔 |
| L | 预算 | fill-sheet | 每日预算（美元） |
| M | 处理时间 | fill-sheet | ISO 日期 |
| N | 备注 | 自动 | 成功/错误信息 |

### 状态流转（G列）

```
deploy → create → fill-sheet → review → [人工审核] → create → bulk-manage → success
                                      ↘ error
           ↑___________________________________|
                          pause（暂停后移到历史表）
```

## G 列状态颜色

- 🟢 **create** = 待创建
- 🟡 **review** = 等待人工审核
- 🔵 **success** = 已完成
- 🔴 **error** = 失败
- ⚪ **pause** = 暂停

## 多用户

```bash
config/profiles/user1.yaml  → 端口 3000
config/profiles/user2.yaml  → 端口 3001
```

在 `ecosystem.config.js` 添加多个 PM2 实例。

## 开发顺序建议

1. **Sheets 模板** — 先搭好表结构
2. **bulk-manage** — 最独立，手动填几行数据测试
3. **deploy** — 联盟 API + 去重
4. **fill-sheet** — 最复杂，最后做

## 踩坑提醒

- Google Ads Scripts **只支持 ES5**（`var`、普通函数）
- 临时 ID 必须用**负数**（`-1`, `-2`...）
- Sheets API 默认每分钟 60 次写请求
- 广告系列名不能重名，加 AID 保证唯一
- 住宅代理不稳定，解析链接有**3次重试**
- Service Account 要加到 Sheets **编辑者**权限
- RSA 标题 ≤30 字符，描述 ≤90 字符，至少 3 个标题 2 个描述
