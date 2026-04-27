/**
 * 测试脚本：验证所有配置是否正确
 * 用法: ts-node scripts/test-all.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

async function main() {
  console.log('=== 配置检查 ===\n');

  let configPath = path.resolve(process.cwd(), 'config.yaml');
  if (!fs.existsSync(configPath)) {
    configPath = path.resolve(__dirname, '../config.yaml');
  }

  if (!fs.existsSync(configPath)) {
    console.error('❌ config.yaml not found');
    process.exit(1);
  }

  const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
  console.log('✅ config.yaml found');

  // 检查字段
  const checks = [
    { key: 'sheets.spreadsheet_id', val: config.sheets?.spreadsheet_id, example: 'your_spreadsheet_id_here' },
    { key: 'keyword_api.api_key', val: config.keyword_api?.api_key, example: 'YOUR_AITDK_API_KEY' },
    { key: 'llm.api_key', val: config.llm?.api_key, example: 'YOUR_LLM_API_KEY' },
    { key: 'server.api_key', val: config.server?.api_key, example: 'CHANGE_ME_TO_RANDOM_SECRET' },
    { key: 'proxy.host', val: config.proxy?.host, example: 'YOUR_PROXY_HOST' },
  ];

  for (const check of checks) {
    if (!check.val || check.val === check.example) {
      console.log(`⚠️  ${check.key} not configured (currently: ${check.val || '(empty)'})`);
    } else {
      console.log(`✅ ${check.key} configured`);
    }
  }

  // 检查 Service Account
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(process.cwd(), 'config/service-account.json');
  if (fs.existsSync(keyPath)) {
    console.log('✅ Service Account key found');
    try {
      const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      console.log(`   Email: ${keyData.client_email}`);
    } catch {
      console.log('❌ Service Account key is invalid JSON');
    }
  } else {
    console.log('⚠️  Service Account key not found');
  }

  // 检查 Sheets 连接
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('\n=== Sheets API 检查 ===\n');
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });
      const client = google.sheets({ version: 'v4', auth });
      const response = await (client as any).spreadsheets.values.get({
        spreadsheetId: config.sheets?.spreadsheet_id,
        range: '批量投放!A1:N1',
      });
      console.log('✅ Sheets API connected');
      console.log(`   Headers: ${(response.data.values || [[]])[0]?.join(', ')}`);
    } catch (e) {
      console.log(`❌ Sheets API error: ${(e as Error).message}`);
    }
  } else {
    console.log('\n⚠️  GOOGLE_APPLICATION_CREDENTIALS not set, skipping Sheets test');
  }

  console.log('\n=== 完成 ===');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
