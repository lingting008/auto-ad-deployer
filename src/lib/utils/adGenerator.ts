import axios from 'axios';
import { AppConfig } from '../types';

// 魔法数字常量
const MAX_TITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 90;
const MAX_TITLES = 15;
const MAX_DESCRIPTIONS = 4;

export interface AdContent {
  titles: string[];
  descriptions: string[];
}

/**
 * 使用 LLM API 生成 Google Ads RSA 广告文案
 */
export class AdGenerator {
  private config: AppConfig['llm'];

  constructor(llmConfig: AppConfig['llm']) {
    this.config = llmConfig;
  }

  /**
   * 生成广告文案
   * @param domain 落地页域名
   * @param brandName 品牌名称
   * @param country 国家
   * @param keywords 关键词
   */
  async generate(domain: string, brandName: string, country: string, keywords: string[]): Promise<AdContent> {
    const countryName = this.countryCodeToName(country);

    const prompt = `你是一个 Google Ads 广告文案专家。请为以下广告系列生成文案。

落地页: ${domain}
品牌: ${brandName}
目标国家: ${countryName}
关键词: ${keywords.join(', ')}

要求:
1. 生成恰好 15 个广告标题，每个 ≤ 30 个字符，用换行符分隔
2. 生成恰好 4 个广告描述，每个 ≤ 90 个字符，用换行符分隔
3. 标题要包含关键词，描述要吸引人、突出卖点
4. 只输出文案，不要解释

输出格式（严格按此格式）:
TITLES:
<15行标题>
DESCRIPTIONS:
<4行描述>`;

    try {
      if (this.config.provider === 'openai') {
        return await this.callOpenAI(prompt);
      } else if (this.config.provider === 'gemini') {
        return await this.callGemini(prompt);
      } else {
        return await this.callOpenAI(prompt);
      }
    } catch (e) {
      console.error('LLM generation failed:', (e as Error).message);
      return this.fallbackGenerate(domain, keywords);
    }
  }

  private async callOpenAI(prompt: string): Promise<AdContent> {
    const response = await axios.post(
      `${this.config.base_url}/chat/completions`,
      {
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.8,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.api_key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const text = response.data.choices?.[0]?.message?.content || '';
    return this.parseResponse(text);
  }

  private async callGemini(prompt: string): Promise<AdContent> {
    const response = await axios.post(
      `${this.config.base_url}/models/${this.config.model}:generateContent`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 500, temperature: 0.8 },
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.api_key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return this.parseResponse(text);
  }

  private parseResponse(text: string): AdContent {
    const titles: string[] = [];
    const descriptions: string[] = [];

    const titleMatch = text.match(/TITLES:(.+?)(?=DESCRIPTIONS:|$)/s);
    const descMatch = text.match(/DESCRIPTIONS:(.+?)$/s);

    if (titleMatch) {
      const lines = titleMatch[1].trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines.slice(0, MAX_TITLES)) {
        const clean = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (clean.length <= MAX_TITLE_LENGTH) titles.push(clean);
      }
    }

    if (descMatch) {
      const lines = descMatch[1].trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines.slice(0, MAX_DESCRIPTIONS)) {
        const clean = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (clean.length <= MAX_DESCRIPTION_LENGTH) descriptions.push(clean);
      }
    }

    // fallback if parsing failed
    if (titles.length === 0) return this.fallbackGenerate('', []);
    return { titles: titles.slice(0, MAX_TITLES), descriptions: descriptions.slice(0, MAX_DESCRIPTIONS) };
  }

  private fallbackGenerate(domain: string, keywords: string[]): AdContent {
    const brand = domain.split('.')[0] || 'Product';
    const kw = keywords[0] || 'Product';

    const titles = [
      `Best ${kw} - Free Shipping`,
      `${kw} Deals & Discounts`,
      `Shop ${brand} Online Now`,
      `Top ${kw} Selection`,
      `Save on ${kw} Today`,
      `${kw} - Official Site`,
      `Buy ${brand} Best Price`,
      `Exclusive ${kw} Offers`,
      `New ${brand} Collection`,
      `Limited ${kw} Deals`,
      `${kw} - Reviews & Ratings`,
      `Compare ${kw} Prices`,
      `${brand} - Fast Delivery`,
      `Premium ${kw} Online`,
      `${kw} - 100% Authentic`,
    ];

    const descriptions = [
      `Discover our best selection of ${kw}. Free shipping on orders over $50. Shop now for exclusive deals and discounts.`,
      `Get the lowest price on ${kw}. Browse thousands of products. Easy returns. Start shopping today!`,
      `${brand} offers top-quality ${kw}. Read reviews, compare prices, and find the perfect product for you.`,
      `Shop our ${kw} collection today. Best prices guaranteed. Fast shipping available worldwide.`,
    ];

    return { titles, descriptions };
  }

  private countryCodeToName(code: string): string {
    const map: { [key: string]: string } = {
      'US': 'United States', 'GB': 'United Kingdom', 'AU': 'Australia',
      'CA': 'Canada', 'DE': 'Germany', 'FR': 'France', 'JP': 'Japan',
      'BR': 'Brazil', 'IN': 'India', 'ES': 'Spain', 'IT': 'Italy',
      'NL': 'Netherlands', 'MX': 'Mexico', 'AR': 'Argentina',
    };
    return map[code] || code;
  }
}
