export type AdStatus = 'create' | 'review' | 'success' | 'error' | 'pause';

/**
 * 批量投放工作表的一行数据
 * 对应 Google Sheets 批量投放表的 A~N 列
 */
export interface BulkRow {
  accountId: string;       // A: Google Ads 子账号 CID
  website: string;         // B: 落地页域名
  campaignName: string;    // C: 广告系列名称
  dynamicUrl: string;      // D: 联盟动态链接 (click-through URL)
  affiliateName: string;    // E: 联盟名称
  country: string;         // F: 国家代码
  status: AdStatus;        // G: 状态
  urlSuffix: string;       // H: URL 后缀参数
  keywords: string;        // I: 关键词（逗号分隔，最多5个）
  titles: string;          // J: 广告标题（15条，\n分隔）
  descriptions: string;    // K: 广告描述（4条，\n分隔）
  budget: number;          // L: 每日预算
  processedAt: string;     // M: 处理时间 (ISO)
  notes: string;           // N: 备注/错误信息
  rowIndex?: number;       // Sheets 行号（1-indexed，含表头）
}

/**
 * 联盟凭证表的一行数据
 */
export interface AffiliateCredential {
  affiliate: string;       // A: 联盟缩写（如 lh, pb）
  siteName: string;        // B: 网站名称
  publisherId: string;     // C: Publisher ID
  apiToken: string;        // D: API Token
  campaignId?: string;     // F: Campaign ID（部分联盟需要）
}

/**
 * 联盟 offer 数据（从 API 拉取的原始数据）
 */
export interface AffiliateOffer {
  id: string;              // 广告主 ID
  name: string;            // 广告主名称
  primaryUrl: string;      // 主推广链接
  clickThroughUrl: string; // 点击追踪链接
  epc?: number;            // 每点击收益
  categories?: string[];   // 分类
}

/**
 * offer 解析后的完整数据
 */
export interface ResolvedOffer {
  offer: AffiliateOffer;
  finalUrl: string;        // 解析后的落地页 URL
  urlSuffix: string;       // 追踪参数
  country: string;         // 目标国家
  keywords: string[];      // 关键词
  titles: string[];         // AI 生成的标题
  descriptions: string[];  // AI 生成的描述
}

/**
 * 配置文件结构
 */
export interface AppConfig {
  sheets: {
    spreadsheet_id: string;
    bulk_tab: string;
    history_tab: string;
    credential_tab: string;
  };
  keyword_api: {
    api_key: string;
    base_url: string;
  };
  llm: {
    provider: 'openai' | 'gemini';
    api_key: string;
    model: string;
    base_url: string;
  };
  proxy: {
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  server: {
    port: number;
    host: string;
    api_key: string;
  };
  campaign: {
    default_budget: number;
    default_country: string;
    mobile_bid_multiplier: number;
  };
}

/**
 * 用户配置（支持多用户）
 */
export interface UserProfile {
  name: string;
  port: number;
  sheets: {
    spreadsheet_id: string;
    bulk_tab: string;
    history_tab: string;
    credential_tab: string;
  };
  service_account_key: string;
  server_api_key?: string;
}
