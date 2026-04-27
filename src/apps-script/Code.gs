/**
 * Google Apps Script - 中转层
 * 在 Google Sheets 菜单栏创建按钮，点击后触发 VPS 上的 fill-sheet 服务
 *
 * 安装方法：
 * 1. 打开 Google Sheets -> 扩展程序 -> Apps Script
 * 2. 将本文件内容粘贴到 Code.gs
 * 3. 部署 -> 新建部署 -> Web App
 * 4. 执行身份：Me，访问权限：Anyone，运行方式：Me
 * 5. 复制 Web App URL
 * 6. 在脚本中填入 SERVER_URL
 *
 * 触发方式：
 * 1. 刷新 Sheets 页面
 * 2. 点击菜单「广告投放」->「一键填充」
 */

const SERVER_URL = 'http://YOUR_SERVER_IP:3000';
const SERVER_API_KEY = 'YOUR_SERVER_API_KEY';

/**
 * 在 Sheets 菜单栏创建自定义菜单
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('广告投放')
    .addItem('一键填充', 'triggerFillSheet')
    .addItem('查看状态', 'checkStatus')
    .addSeparator()
    .addItem('帮助', 'showHelp')
    .addToUi();
}

/**
 * 触发 fill-sheet 服务
 */
function triggerFillSheet() {
  const url = `${SERVER_URL}/fill?api_key=${SERVER_API_KEY}`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'X-API-Key': SERVER_API_KEY,
      },
    });

    const json = JSON.parse(response.getContentText());
    const status = json.status;

    if (status === 'started') {
      SpreadsheetApp.getUi().alert(
        '🚀 已启动！',
        'fill-sheet 服务已启动，请等待 2-5 分钟后刷新页面查看结果。',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else if (status === 'already_running') {
      SpreadsheetApp.getUi().alert(
        '⏳ 正在运行中',
        'fill-sheet 服务已在处理中，请稍后再试。',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert('状态: ' + status);
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      '❌ 启动失败',
      '无法连接到服务器: ' + e.message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * 查看服务状态
 */
function checkStatus() {
  const url = `${SERVER_URL}/health`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
    });

    const json = JSON.parse(response.getContentText());
    SpreadsheetApp.getUi().alert(
      '服务器状态',
      `状态: ${json.status}\n运行中: ${json.running}\n时间: ${json.timestamp}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ 服务器无响应: ' + e.message);
  }
}

/**
 * 显示帮助
 */
function showHelp() {
  SpreadsheetApp.getUi().alert(
    '自动广告投放系统',
    '1. 点击「一键填充」触发 fill-sheet 服务\n' +
    '2. 服务会自动解析链接、获取关键词、生成广告文案\n' +
    '3. 完成后请检查 G 列状态为「review」的行\n' +
    '4. 人工审核后，将 G 列改为「create」放行\n' +
    '5. bulk-manage 会自动创建广告\n\n' +
    '状态说明:\n' +
    'create = 待处理\n' +
    'review = 等待人工审核\n' +
    'success = 广告创建成功\n' +
    'error = 处理失败\n' +
    'pause = 暂停\n\n' +
    'VPS 服务器: ' + SERVER_URL,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 测试连接（用于验证脚本是否正确配置）
 */
function testConnection() {
  checkStatus();
}
