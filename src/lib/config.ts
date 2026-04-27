import { AppConfig } from './types';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * 验证配置文件结构，抛出详细错误信息
 */
export function validateConfig(config: unknown): AppConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('Config must be an object');
  }

  const c = config as Record<string, unknown>;

  // 检查 sheets
  if (!c.sheets || typeof c.sheets !== 'object') {
    throw new ConfigValidationError('Missing or invalid "sheets" section');
  }
  const sheets = c.sheets as Record<string, unknown>;
  if (!sheets.spreadsheet_id || typeof sheets.spreadsheet_id !== 'string') {
    throw new ConfigValidationError('Missing "sheets.spreadsheet_id"');
  }
  if (!sheets.bulk_tab || typeof sheets.bulk_tab !== 'string') {
    throw new ConfigValidationError('Missing "sheets.bulk_tab"');
  }
  if (!sheets.history_tab || typeof sheets.history_tab !== 'string') {
    throw new ConfigValidationError('Missing "sheets.history_tab"');
  }
  if (!sheets.credential_tab || typeof sheets.credential_tab !== 'string') {
    throw new ConfigValidationError('Missing "sheets.credential_tab"');
  }

  // 检查 keyword_api
  if (!c.keyword_api || typeof c.keyword_api !== 'object') {
    throw new ConfigValidationError('Missing or invalid "keyword_api" section');
  }
  const keywordApi = c.keyword_api as Record<string, unknown>;
  if (!keywordApi.api_key || typeof keywordApi.api_key !== 'string') {
    throw new ConfigValidationError('Missing "keyword_api.api_key"');
  }
  if (keywordApi.api_key === 'YOUR_AITDK_API_KEY') {
    throw new ConfigValidationError('Please set a real "keyword_api.api_key"');
  }

  // 检查 llm
  if (!c.llm || typeof c.llm !== 'object') {
    throw new ConfigValidationError('Missing or invalid "llm" section');
  }
  const llm = c.llm as Record<string, unknown>;
  if (!llm.api_key || typeof llm.api_key !== 'string') {
    throw new ConfigValidationError('Missing "llm.api_key"');
  }
  if (llm.api_key === 'YOUR_LLM_API_KEY') {
    throw new ConfigValidationError('Please set a real "llm.api_key"');
  }
  if (!llm.provider || !['openai', 'gemini'].includes(llm.provider as string)) {
    throw new ConfigValidationError('llm.provider must be "openai" or "gemini"');
  }

  // 检查 proxy
  if (!c.proxy || typeof c.proxy !== 'object') {
    throw new ConfigValidationError('Missing or invalid "proxy" section');
  }
  const proxy = c.proxy as Record<string, unknown>;
  if (!proxy.host || typeof proxy.host !== 'string') {
    throw new ConfigValidationError('Missing "proxy.host"');
  }
  if (proxy.host === 'YOUR_PROXY_HOST') {
    throw new ConfigValidationError('Please set a real "proxy.host"');
  }
  if (typeof proxy.port !== 'number' || proxy.port <= 0) {
    throw new ConfigValidationError('Missing or invalid "proxy.port"');
  }

  // 检查 server
  if (!c.server || typeof c.server !== 'object') {
    throw new ConfigValidationError('Missing or invalid "server" section');
  }
  const server = c.server as Record<string, unknown>;
  if (typeof server.port !== 'number' || server.port <= 0) {
    throw new ConfigValidationError('Missing or invalid "server.port"');
  }
  if (!server.api_key || typeof server.api_key !== 'string') {
    throw new ConfigValidationError('Missing "server.api_key"');
  }
  if (server.api_key === 'CHANGE_ME_TO_RANDOM_SECRET') {
    throw new ConfigValidationError('Please change "server.api_key" to a secure random secret');
  }

  // 检查 campaign
  if (!c.campaign || typeof c.campaign !== 'object') {
    throw new ConfigValidationError('Missing or invalid "campaign" section');
  }
  const campaign = c.campaign as Record<string, unknown>;
  if (typeof campaign.default_budget !== 'number' || campaign.default_budget <= 0) {
    throw new ConfigValidationError('Missing or invalid "campaign.default_budget"');
  }
  if (!campaign.default_country || typeof campaign.default_country !== 'string') {
    throw new ConfigValidationError('Missing "campaign.default_country"');
  }
  if (typeof campaign.mobile_bid_multiplier !== 'number') {
    throw new ConfigValidationError('Missing or invalid "campaign.mobile_bid_multiplier"');
  }

  return config as AppConfig;
}

/**
 * 安全加载 YAML 配置（带校验）
 * 支持环境变量覆盖敏感配置
 */
export function loadConfig(configPath: string): AppConfig {
  const fs = require('fs');
  const yaml = require('js-yaml');

  if (!fs.existsSync(configPath)) {
    throw new ConfigValidationError(`Config file not found: ${configPath}`);
  }

  const rawConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  // 环境变量覆盖（便于敏感信息不写入配置文件）
  if (process.env.SHEETS_SPREADSHEET_ID) {
    rawConfig.sheets = rawConfig.sheets || {};
    (rawConfig.sheets as Record<string, unknown>).spreadsheet_id = process.env.SHEETS_SPREADSHEET_ID;
  }
  if (process.env.SERVER_API_KEY) {
    rawConfig.server = rawConfig.server || {};
    (rawConfig.server as Record<string, unknown>).api_key = process.env.SERVER_API_KEY;
  }
  if (process.env.LLM_API_KEY) {
    rawConfig.llm = rawConfig.llm || {};
    (rawConfig.llm as Record<string, unknown>).api_key = process.env.LLM_API_KEY;
  }
  if (process.env.KEYWORD_API_KEY) {
    rawConfig.keyword_api = rawConfig.keyword_api || {};
    (rawConfig.keyword_api as Record<string, unknown>).api_key = process.env.KEYWORD_API_KEY;
  }
  if (process.env.PROXY_HOST) {
    rawConfig.proxy = rawConfig.proxy || {};
    (rawConfig.proxy as Record<string, unknown>).host = process.env.PROXY_HOST;
  }
  if (process.env.PROXY_PORT) {
    rawConfig.proxy = rawConfig.proxy || {};
    (rawConfig.proxy as Record<string, unknown>).port = parseInt(process.env.PROXY_PORT, 10);
  }
  if (process.env.PROXY_USERNAME) {
    rawConfig.proxy = rawConfig.proxy || {};
    (rawConfig.proxy as Record<string, unknown>).username = process.env.PROXY_USERNAME;
  }
  if (process.env.PROXY_PASSWORD) {
    rawConfig.proxy = rawConfig.proxy || {};
    (rawConfig.proxy as Record<string, unknown>).password = process.env.PROXY_PASSWORD;
  }

  return validateConfig(rawConfig);
}
