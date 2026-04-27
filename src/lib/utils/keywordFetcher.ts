import axios from 'axios';
import { AppConfig } from '../types';

// 魔法数字常量
const MIN_SEARCH_VOLUME = 200;
const REQUEST_TIMEOUT_MS = 10000;

export interface KeywordResult {
  keywords: string[];
  country: string;
  traffic?: number;
}

/**
 * 使用 AITDK API 获取域名关键词和目标国家
 */
export class KeywordFetcher {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AppConfig) {
    this.apiKey = config.keyword_api.api_key;
    this.baseUrl = config.keyword_api.base_url;
  }

  /**
   * 获取域名的关键词
   */
  async getKeywords(domain: string, limit: number = 5): Promise<KeywordResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/domain`, {
        params: {
          api_key: this.apiKey,
          domain,
          data: 'top_keywords',
        },
        timeout: REQUEST_TIMEOUT_MS,
      });

      const data = response.data;
      const keywords: string[] = [];
      let topRegion = 'US';
      let traffic = 0;

      if (data.top_keywords && Array.isArray(data.top_keywords)) {
        for (const kw of data.top_keywords) {
          if (keywords.length >= limit) break;
          if (kw.keyword && kw.search_volume > MIN_SEARCH_VOLUME) {
            keywords.push(kw.keyword);
          }
        }
      }

      if (data.top_region) {
        topRegion = this.normalizeCountry(data.top_region);
      }

      if (data.traffic) {
        traffic = data.traffic;
      }

      // 流量太低则不推荐
      if (traffic < MIN_SEARCH_VOLUME) {
        return { keywords: [], country: topRegion, traffic };
      }

      return { keywords, country: topRegion, traffic };
    } catch (e) {
      console.error(`Failed to fetch keywords for ${domain}:`, (e as Error).message);
      return { keywords: [], country: 'US', traffic: 0 };
    }
  }

  private normalizeCountry(regionCode: string): string {
    const map: { [key: string]: string } = {
      'US': 'US', 'USA': 'US', 'United States': 'US',
      'GB': 'GB', 'UK': 'GB', 'United Kingdom': 'GB',
      'AU': 'AU', 'Australia': 'AU',
      'CA': 'CA', 'Canada': 'CA',
      'DE': 'DE', 'Germany': 'DE',
      'FR': 'FR', 'France': 'FR',
      'JP': 'JP', 'Japan': 'JP',
      'BR': 'BR', 'Brazil': 'BR',
      'IN': 'IN', 'India': 'IN',
      'ES': 'ES', 'Spain': 'ES',
      'IT': 'IT', 'Italy': 'IT',
      'NL': 'NL', 'Netherlands': 'NL',
    };
    return map[regionCode] || regionCode;
  }
}
