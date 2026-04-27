import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { AppConfig } from '../types';

export class SheetsClient {
  private client: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(config: AppConfig) {
    this.spreadsheetId = config.sheets.spreadsheet_id;

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    this.client = google.sheets({ version: 'v4', auth });
  }

  async readSheet(tabName: string): Promise<string[][]> {
    const response = await this.client.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tabName}!A:N`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    return response.data.values || [];
  }

  async writeRow(tabName: string, rowIndex: number, values: (string | number)[]): Promise<void> {
    const range = `${tabName}!A${rowIndex}:N${rowIndex}`;
    await this.client.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  }

  async writeRows(tabName: string, startRow: number, rows: (string | number)[][]): Promise<void> {
    if (rows.length === 0) return;
    const endRow = startRow + rows.length - 1;
    const range = `${tabName}!A${startRow}:N${endRow}`;
    await this.client.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }

  async findEmptyRowInColumn(tabName: string, column: string, afterRow: number = 1): Promise<number | null> {
    const range = `${tabName}!${column}${afterRow}:${column}`;
    const response = await this.client.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    const values = response.data.values || [];
    for (let i = 0; i < values.length; i++) {
      if (!values[i] || values[i].length === 0 || values[i][0] === '') {
        return afterRow + i;
      }
    }
    return null;
  }

  async getRowsByStatus(tabName: string, status: string): Promise<{ rowIndex: number; values: string[] }[]> {
    const allRows = await this.readSheet(tabName);
    const results: { rowIndex: number; values: string[] }[] = [];
    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (row[6] === status) { // G 列是 status
        results.push({ rowIndex: i + 1, values: row });
      }
    }
    return results;
  }

  async updateStatus(tabName: string, rowIndex: number, status: string, notes?: string): Promise<void> {
    const updates: { [key: string]: string } = { G: status };
    if (notes !== undefined) updates['N'] = notes;

    const columnLetters = Object.keys(updates);
    const range = `${tabName}!${columnLetters[0]}${rowIndex}:${columnLetters[columnLetters.length - 1]}${rowIndex}`;

    const response = await this.client.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const currentValues = (response.data.values || [[]])[0] || [];
    const newValues: (string | number)[] = [...currentValues];

    for (const [col, val] of Object.entries(updates)) {
      const colIndex = col.charCodeAt(0) - 65;
      newValues[colIndex] = val;
    }

    await this.writeRow(tabName, rowIndex, newValues);
  }

  async moveRowToHistory(bulkTab: string, historyTab: string, rowIndex: number): Promise<void> {
    const rows = await this.readSheet(bulkTab);
    const rowData = rows[rowIndex - 1];
    if (!rowData) return;

    const historyRows = await this.readSheet(historyTab);
    const newRowIndex = historyRows.length + 1;
    await this.writeRow(historyTab, newRowIndex, rowData);

    // 清空原行
    await this.client.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${bulkTab}!${rowIndex}:${rowIndex}`,
    });
  }

  async getCredentials(credentialTab: string): Promise<{ [affiliate: string]: { [siteName: string]: { pid: string; token: string; campaignId?: string } } }> {
    const rows = await this.readSheet(credentialTab);
    const credentials: { [affiliate: string]: { [siteName: string]: { pid: string; token: string; campaignId?: string } } } = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || !row[2] || !row[3]) continue;
      const affiliate = row[0];
      const siteName = row[1];
      const pid = row[2];
      const token = row[3];
      const campaignId = row[5];

      if (!credentials[affiliate]) credentials[affiliate] = {};
      credentials[affiliate][siteName] = { pid, token, campaignId };
    }
    return credentials;
  }
}
