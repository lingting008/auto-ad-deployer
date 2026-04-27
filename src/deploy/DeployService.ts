import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, AffiliateOffer } from '../lib/types';
import { loadConfig } from '../lib/config';
import { SheetsClient } from '../lib/sheets/client';
import { AffiliateFactory } from '../lib/affiliates/factory';

interface DeployOptions {
  affiliate?: string;
  siteName?: string;
  count?: number;
  dryRun?: boolean;
}

export class DeployService {
  private config: AppConfig;
  private sheets: SheetsClient;
  private processedOffers: Set<string>;
  private allOfferIds: Set<string>;

  constructor(configPath: string) {
    this.config = loadConfig(configPath);
    this.sheets = new SheetsClient(this.config);
    this.processedOffers = new Set();
    this.allOfferIds = new Set();
  }

  async initialize(): Promise<void> {
    // 从历史总表加载已处理的 offer ID（去重）
    try {
      const historyRows = await this.sheets.readSheet(this.config.sheets.history_tab);
      for (let i = 1; i < historyRows.length; i++) {
        const row = historyRows[i];
        if (row[4]) { // E 列是 affiliate name，格式如 lh-12345-109748-ad
          this.processedOffers.add(row[4]);
        }
      }
    } catch (e) {
      console.log('No history tab found, skipping dedup');
    }

    // 从当前批量投放表加载已处理的 offer ID
    try {
      const bulkRows = await this.sheets.readSheet(this.config.sheets.bulk_tab);
      for (let i = 1; i < bulkRows.length; i++) {
        const row = bulkRows[i];
        if (row[4]) {
          this.processedOffers.add(row[4]);
        }
      }
    } catch (e) {
      console.log('No bulk tab found, skipping dedup');
    }
  }

  async deploy(options: DeployOptions = {}): Promise<{ deployed: number; skipped: number }> {
    await this.initialize();

    const { affiliate, siteName, count = 5, dryRun = false } = options;

    const credentials = await this.sheets.getCredentials(this.config.sheets.credential_tab);

    let deployed = 0;
    let skipped = 0;

    // 遍历联盟
    type SiteCredentials = { pid: string; token: string; campaignId?: string };
    type AffiliateSites = { [siteName: string]: SiteCredentials };
    const affiliates: { [affiliate: string]: AffiliateSites } = affiliate ? { [affiliate]: credentials[affiliate] || {} } : credentials;

    for (const [affName, sites] of Object.entries(affiliates)) {
      if (Object.keys(sites).length === 0) {
        console.log(`No credentials for affiliate: ${affName}`);
        continue;
      }

      const sitesToProcess = siteName ? { [siteName]: sites[siteName] } : sites;

      for (const [siteNameKey, cred] of Object.entries(sitesToProcess)) {
        console.log(`\nProcessing ${affName} / ${siteNameKey}...`);

        try {
          const adapter = AffiliateFactory.getAdapter(affName);
          const offers = await adapter.fetchOffers({ pid: cred.pid, token: cred.token, campaignId: cred.campaignId });

          // 按 EPC 排序，优先处理高收益的
          offers.sort((a: AffiliateOffer, b: AffiliateOffer) => (b.epc || 0) - (a.epc || 0));

          let countToProcess = Math.min(count, offers.length);

          for (const offer of offers.slice(0, countToProcess)) {
            const offerKey = this.generateOfferKey(affName, offer.id);

            if (this.processedOffers.has(offerKey)) {
              console.log(`  SKIP (already processed): ${offer.name}`);
              skipped++;
              continue;
            }

            if (!dryRun) {
              const written = await this.writeOfferToSheet(affName, siteNameKey, offer);
              if (written) deployed++;
              else skipped++;
            } else {
              console.log(`  DRY: Would deploy ${offer.name} (EPC: ${offer.epc})`);
              deployed++;
            }

            this.processedOffers.add(offerKey);
          }

          // 清理已满的 CID 行
          await this.cleanupFilledRows();
        } catch (e) {
          console.error(`  ERROR: ${(e as Error).message}`);
        }
      }
    }

    console.log(`\nDone! Deployed: ${deployed}, Skipped: ${skipped}`);
    return { deployed, skipped };
  }

  private generateOfferKey(affName: string, offerId: string): string {
    return `${affName}-${offerId}`;
  }

  private async writeOfferToSheet(affName: string, siteName: string, offer: AffiliateOffer): Promise<boolean> {
    // 找到有 CID 但没有 D 列数据的行
    const bulkRows = await this.sheets.readSheet(this.config.sheets.bulk_tab);

    for (let i = 1; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      const accountId = row[0]; // A 列: account ID (CID)
      const dynamicUrl = row[3]; // D 列

      if (accountId && !dynamicUrl) {
        const offerKey = this.generateOfferKey(affName, offer.id);
        const affiliateKey = this.buildAffiliateKey(affName, offer.id);

        const rowIndex = i + 1;
        const rowData: (string | number)[] = [
          accountId,  // A: account ID (CID)
          '',         // B: website (fill-sheet 填)
          '',         // C: campaign name (fill-sheet 填)
          offer.clickThroughUrl || offer.primaryUrl,  // D: dynamic URL
          affiliateKey,  // E: affiliate name (offer key)
          '',         // F: country (fill-sheet 填)
          'create',   // G: status
          '',         // H: url suffix (fill-sheet 填)
          '',         // I: keywords
          '',         // J: titles
          '',         // K: descriptions
          this.config.campaign.default_budget, // L: budget
          new Date().toISOString(), // M: processed at
          '',         // N: notes
        ];

        await this.sheets.writeRow(this.config.sheets.bulk_tab, rowIndex, rowData);
        console.log(`  Deployed: ${offer.name} -> row ${rowIndex} (EPC: ${offer.epc})`);
        return true;
      }
    }

    console.log(`  No empty slots found for ${affName}/${siteName}`);
    return false;
  }

  private buildAffiliateKey(affName: string, offerId: string): string {
    return `${affName}-${offerId}-ad`;
  }

  private async cleanupFilledRows(): Promise<void> {
    // 当一行有 D 列数据但 G 列变成 pause 时，移到历史表
    const bulkRows = await this.sheets.readSheet(this.config.sheets.bulk_tab);
    for (let i = bulkRows.length - 1; i >= 1; i--) {
      const row = bulkRows[i];
      if (row[6] === 'pause') { // G 列 = pause
        await this.sheets.moveRowToHistory(
          this.config.sheets.bulk_tab,
          this.config.sheets.history_tab,
          i + 1
        );
        console.log(`  Moved paused offer to history: ${row[4]}`);
      }
    }
  }
}
