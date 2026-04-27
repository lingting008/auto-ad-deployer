/**
 * setup-sheets.ts
 * 自动创建 Google Sheets 模板结构
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const SHEETS_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];

async function createSpreadsheet(title: string = '自动广告投放系统'): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  const client = google.sheets({ version: 'v4', auth }) as sheets_v4.Sheets;

  // 创建 spreadsheet
  const response = await client.spreadsheets.create({
    resource: {
      properties: { title },
      sheets: [
        {
          properties: { title: '批量投放', index: 0 },
        },
        {
          properties: { title: 'offer历史总表', index: 1 },
        },
        {
          properties: { title: '联盟凭证', index: 2 },
        },
      ],
    },
  });

  const spreadsheetId = response.data.spreadsheetId!;
  console.log(`Created spreadsheet: ${spreadsheetId}`);

  const spreadsheetUrl = response.data.spreadsheetUrl!;
  console.log(`URL: ${spreadsheetUrl}`);

  return spreadsheetId;
}

async function setupBulkTab(client: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const tabName = '批量投放';

  // 设置表头
  const headers = [
    '账号ID(CID)',       // A
    '官网',              // B
    '广告系列名称',       // C
    '动态链接',          // D
    '联盟名称',          // E
    '国家',              // F
    '状态',              // G
    'URL后缀参数',       // H
    '关键词',            // I
    '标题(15条)',         // J
    '描述(4条)',         // K
    '预算',              // L
    '处理时间',          // M
    '备注',              // N
  ];

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:N1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  // 格式化表头
  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          repeatCell: {
            range: `${tabName}!A1:N1`,
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: 0,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 14,
            },
          },
        },
        {
          conditionalFormatRules: {
            rules: [
              // G=create 绿色
              {
                ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 }],
                rule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'create' }] },
                  format: { backgroundColor: { red: 0.8, green: 1, blue: 0.8 } },
                },
              },
              // G=review 黄色
              {
                ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 }],
                rule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'review' }] },
                  format: { backgroundColor: { red: 1, green: 1, blue: 0.6 } },
                },
              },
              // G=success 蓝色
              {
                ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 }],
                rule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'success' }] },
                  format: { backgroundColor: { red: 0.6, green: 0.8, blue: 1 } },
                },
              },
              // G=error 红色
              {
                ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 }],
                rule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'error' }] },
                  format: { backgroundColor: { red: 1, green: 0.8, blue: 0.8 } },
                },
              },
              // G=pause 灰色
              {
                ranges: [{ sheetId: 0, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 }],
                rule: {
                  condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'pause' }] },
                  format: { backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } },
                },
              },
            ],
          },
        },
      ],
    },
  });

  // 添加示例 CID 行
  const sampleRows = [
    ['123-456-7890', '', '', '', '', 'US', 'create', '', '', '', '', 1.5, '', ''],
    ['123-456-7891', '', '', '', '', 'US', 'create', '', '', '', '', 1.5, '', ''],
    ['123-456-7892', '', '', '', '', 'US', 'create', '', '', '', '', 1.5, '', ''],
  ];

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A2:N4`,
    valueInputOption: 'RAW',
    requestBody: { values: sampleRows },
  });

  console.log('Bulk tab set up with sample rows');
}

async function setupCredentialTab(client: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const tabName = '联盟凭证';

  const headers = ['联盟名称', '网站名称', 'PID', 'API Token', '', 'Campaign ID', '备注'];

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          repeatCell: {
            range: `${tabName}!A1:G1`,
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.6, blue: 0.3 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });

  // 示例数据
  const sampleCredentials = [
    ['lh', 'main', 'YOUR_PID', 'YOUR_TOKEN', '', '', 'LinkHouse'],
    ['pb', 'main', 'YOUR_PID', 'YOUR_API_KEY', '', '', 'PeerFly'],
  ];

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A2:G3`,
    valueInputOption: 'RAW',
    requestBody: { values: sampleCredentials },
  });

  console.log('Credential tab set up');
}

async function setupHistoryTab(client: sheets_v4.Sheets, spreadsheetId: string): Promise<void> {
  const tabName = 'offer历史总表';

  const headers = [
    '账号ID(CID)', '官网', '广告系列名称', '动态链接', '联盟名称',
    '国家', '状态', 'URL后缀参数', '关键词', '标题(15条)', '描述(4条)',
    '预算', '处理时间', '备注',
  ];

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:N1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests: [
        {
          repeatCell: {
            range: `${tabName}!A1:N1`,
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.5, green: 0.3, blue: 0.7 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });

  console.log('History tab set up');
}

async function shareSpreadsheet(client: sheets_v4.Sheets, spreadsheetId: string, serviceAccountEmail: string): Promise<void> {
  // 将 Service Account 添加为编辑者
  await client.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: {},
    auth: undefined,
  });
  console.log(`Share this spreadsheet with: ${serviceAccountEmail}`);
  console.log('(Add as Editor in Share settings)');
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Please set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    process.exit(1);
  }

  const create = process.argv.includes('--create');
  let spreadsheetId = process.argv.find(arg => arg.startsWith('--id='))?.split('=')[1];

  if (create) {
    spreadsheetId = await createSpreadsheet();
    console.log(`\nNew spreadsheet ID: ${spreadsheetId}`);
    console.log('Add this ID to your config.yaml\n');
  }

  if (!spreadsheetId) {
    console.error('Usage: ts-node scripts/setup-sheets.ts --create [--id=SPREADSHEET_ID]');
    process.exit(1);
  }

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  const client = google.sheets({ version: 'v4', auth }) as sheets_v4.Sheets;

  console.log('Setting up sheets...');
  await setupBulkTab(client, spreadsheetId);
  await setupCredentialTab(client, spreadsheetId);
  await setupHistoryTab(client, spreadsheetId);

  console.log('\n✅ Sheets setup complete!');
  console.log(`Spreadsheet ID: ${spreadsheetId}`);
  console.log(`URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
