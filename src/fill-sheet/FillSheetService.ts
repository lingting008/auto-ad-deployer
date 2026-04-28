import { SheetsClient } from '../lib/sheets/client';
import { LinkResolver } from '../lib/utils/linkResolver';
import { KeywordFetcher } from '../lib/utils/keywordFetcher';
import { AdGenerator } from '../lib/utils/adGenerator';
import { AppConfig } from '../lib/types';

export class FillSheetService {
  private config: AppConfig;
  private sheets: SheetsClient;
  private keywordFetcher: KeywordFetcher;
  private adGenerator: AdGenerator;
  private isRunning: boolean = false;

  constructor(config: AppConfig) {
    this.config = config;
    this.sheets = new SheetsClient(config);
    this.keywordFetcher = new KeywordFetcher(config);
    this.adGenerator = new AdGenerator(config.llm);
  }

  private createResolver(country: string): LinkResolver {
    // 国家名称转代码
    const countryCode = this.countryToCode(country);
    // 代理用户名格式: base_custom_zone_XX
    const proxyUsername = `${this.config.proxy.username}_custom_zone_${countryCode}`;
    return new LinkResolver(
      this.config.proxy.host,
      this.config.proxy.port,
      proxyUsername,
      this.config.proxy.password
    );
  }

  private countryToCode(country: string): string {
    const map: { [key: string]: string } = {
      'US': 'US', 'United States': 'US', 'United Kingdom': 'UK', 'UK': 'UK',
      'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES',
      'Netherlands': 'NL', 'Japan': 'JP', 'Canada': 'CA', 'Australia': 'AU',
      'Brazil': 'BR', 'India': 'IN', 'Mexico': 'MX', 'South Korea': 'KR',
    };
    return map[country] || country.substring(0, 2).toUpperCase();
  }

  async process(): Promise<{ processed: number; errors: string[] }> {
    if (this.isRunning) {
      return { processed: 0, errors: ['Already running'] };
    }

    this.isRunning = true;
    const errors: string[] = [];

    try {
      const rows = await this.sheets.getRowsByStatus(this.config.sheets.bulk_tab, 'create');
      let processed = 0;

      for (const { rowIndex, values } of rows) {
        const row = this.parseRow(values, rowIndex);

        if (row.urlSuffix || row.website) {
          await this.sheets.updateStatus(this.config.sheets.bulk_tab, rowIndex, 'review');
          console.log(`Row ${rowIndex}: Already processed, moving to review`);
          processed++;
          continue;
        }

        // 根据国家创建对应的 LinkResolver
        const linkResolver = this.createResolver(row.country || 'US');
        console.log(`\nProcessing row ${rowIndex}: ${row.dynamicUrl}`);

        try {
          // Step 1: 解析链接
          console.log(`  Step 1: Resolving link...`);
          const resolved = await linkResolver.resolve(row.dynamicUrl, row.country || 'US');
          console.log(`  -> Final URL: ${resolved.finalUrl}`);
          console.log(`  -> Domain: ${resolved.domain}`);
          console.log(`  -> URL Suffix: ${resolved.urlSuffix}`);

          // Step 2: 获取关键词
          console.log(`  Step 2: Fetching keywords...`);
          const kwResult = await this.keywordFetcher.getKeywords(resolved.domain, 5);
          console.log(`  -> Keywords: ${kwResult.keywords.join(', ')}`);
          console.log(`  -> Country: ${kwResult.country}`);
          console.log(`  -> Traffic: ${kwResult.traffic}`);

          if (kwResult.keywords.length === 0) {
            await this.sheets.updateStatus(this.config.sheets.bulk_tab, rowIndex, 'error', 'No keywords (traffic too low)');
            errors.push(`Row ${rowIndex}: No keywords found`);
            processed++;
            continue;
          }

          // Step 3: 生成广告文案
          console.log(`  Step 3: Generating ad copy...`);
          const adContent = await this.adGenerator.generate(
            resolved.domain,
            resolved.domain.split('.')[0],  // brandName from domain
            kwResult.country,
            kwResult.keywords
          );
          console.log(`  -> Generated ${adContent.titles.length} titles, ${adContent.descriptions.length} descriptions`);

          // Step 4: 写回 Sheets
          console.log(`  Step 4: Writing to Sheets...`);
          await this.sheets.writeRow(this.config.sheets.bulk_tab, rowIndex, [
            row.accountId,                             // A
            resolved.domain,                           // B
            this.buildCampaignName(row.affiliateName, kwResult.country), // C
            row.dynamicUrl,                           // D
            row.affiliateName,                        // E
            kwResult.country || row.country || 'US',   // F
            'review',                                  // G
            resolved.urlSuffix,                        // H
            kwResult.keywords.join(','),               // I
            adContent.titles.join('\n'),               // J
            adContent.descriptions.join('\n'),         // K
            this.config.campaign.default_budget,       // L
            new Date().toISOString(),                  // M
            '',                                        // N
          ]);

          console.log(`  Row ${rowIndex}: Done!`);
          processed++;
        } catch (e) {
          const err = e as Error;
          console.error(`  Row ${rowIndex}: ERROR - ${err.message}`);
          await this.sheets.updateStatus(this.config.sheets.bulk_tab, rowIndex, 'error', err.message);
          errors.push(`Row ${rowIndex}: ${err.message}`);
          processed++;
        }
      }

      return { processed, errors };
    } finally {
      this.isRunning = false;
    }
  }

  private parseRow(values: string[], rowIndex: number) {
    return {
      accountId: values[0] || '',
      website: values[1] || '',
      campaignName: values[2] || '',
      dynamicUrl: values[3] || '',
      affiliateName: values[4] || '',
      country: values[5] || 'US',
      status: (values[6] as 'create' | 'review' | 'success' | 'error' | 'pause') || 'create',
      urlSuffix: values[7] || '',
      keywords: values[8] || '',
      titles: values[9] || '',
      descriptions: values[10] || '',
      budget: parseFloat(values[11]) || 1.5,
      processedAt: values[12] || '',
      notes: values[13] || '',
      rowIndex,
    };
  }

  private buildCampaignName(affiliateName: string, country: string): string {
    const parts = affiliateName.split('-');
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}-${country}`;
    }
    return `${affiliateName}-${country}`;
  }
}
