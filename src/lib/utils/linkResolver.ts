import axios, { AxiosError } from 'axios';
// @ts-ignore - https-proxy-agent 没有类型定义
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface LinkResolutionResult {
  finalUrl: string;
  urlSuffix: string;
  domain: string;
  redirectChain: string[];
}

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

// 魔法数字常量
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECT_DEPTH = 20;
const MIN_LANDING_PAGE_SIZE = 2048;
const MAX_RETRY_ATTEMPTS = 3;

/**
 * 解析联盟推广链接，跟随所有跳转获取最终落地页和追踪参数
 * 支持 HTTP 302、JavaScript、meta refresh、form POST 等跳转方式
 */
export class LinkResolver {
  private proxyConfig: ProxyConfig;

  constructor(proxyHost: string, proxyPort: number, proxyUser?: string, proxyPass?: string) {
    this.proxyConfig = {
      host: proxyHost,
      port: proxyPort,
      username: proxyUser,
      password: proxyPass,
    };
  }

  static fromConfig(config: ProxyConfig): LinkResolver {
    return new LinkResolver(config.host, config.port, config.username, config.password);
  }

  /**
   * 解析一个链接，跟随所有跳转
   */
  async resolve(offerUrl: string, country: string = 'US'): Promise<LinkResolutionResult> {
    const redirectChain: string[] = [];
    let currentUrl = offerUrl;
    const seen = new Set<string>();
    const cookies: { [key: string]: string } = {};

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await this.followRedirect(currentUrl, country, cookies, seen, redirectChain);
        if (result) return result;
      } catch (e) {
        console.error(`Attempt ${attempt + 1} failed:`, (e as Error).message);
      }
    }

    throw new Error(`Failed to resolve link after 3 attempts: ${offerUrl}`);
  }

  private buildProxyAgent(): HttpsProxyAgent | null {
    const { host, port, username, password } = this.proxyConfig;
    if (!host) return null;
    const auth = username ? `${username}:${password || ''}` : undefined;
    const proxyUrl = `http://${auth ? auth + '@' : ''}${host}:${port}`;
    return new HttpsProxyAgent(proxyUrl);
  }

  private async followRedirect(
    url: string,
    country: string,
    cookies: { [key: string]: string },
    seen: Set<string>,
    chain: string[]
  ): Promise<LinkResolutionResult | null> {
    const urlKey = url + '|GET';
    if (seen.has(urlKey)) {
      if (seen.size >= MAX_REDIRECT_DEPTH) return null;
    }
    seen.add(urlKey);
    chain.push(url);

    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await axios({
        method: 'GET',
        url: url,
        maxRedirects: 0,
        headers: {
          'User-Agent': this.randomUserAgent(),
          'Accept-Language': this.randomAcceptLanguage(country),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        httpsAgent: this.buildProxyAgent(),
        httpAgent: this.buildProxyAgent(),
        validateStatus: (status) => status !== undefined && status < 600,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // HTTP 重定向
      if (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) {
        const location = response.headers['location'];
        if (!location) return null;
        const nextUrl = this.resolveUrl(url, location);

        // 收集 cookies
        const setCookies = response.headers['set-cookie'] as string[] | string | undefined;
        if (setCookies) {
          const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
          for (const sc of cookieArray) {
            const match = sc.match(/^([^=]+)=([^;]+)/);
            if (match) cookies[match[1]] = match[2];
          }
        }
        return this.followRedirect(nextUrl, country, cookies, seen, chain);
      }

      // 200 响应，检查页面大小
      if (response.status === 200) {
        const html = typeof response.data === 'string' ? response.data : String(response.data);

        // 落地页判断：内容 > 2KB
        if (html.length > MIN_LANDING_PAGE_SIZE) {
          const urlSuffix = this.extractUrlSuffix(chain);
          const finalUrl = chain[chain.length - 1];
          const urlObj = new URL(finalUrl);
          return { finalUrl, urlSuffix, domain: urlObj.hostname, redirectChain: chain };
        }

        // 2KB 以下，检查 JS/meta/form 跳转
        const jsRedirect = this.extractJsRedirect(html);
        if (jsRedirect) {
          return this.followRedirect(jsRedirect, country, cookies, seen, chain);
        }

        const metaRefresh = this.extractMetaRefresh(html);
        if (metaRefresh) {
          console.log(`  [Meta Refresh] Found: ${metaRefresh}`);
          return this.followRedirect(metaRefresh, country, cookies, seen, chain);
        }

        const formPost = this.extractFormPost(html);
        if (formPost && formPost.action) {
          console.log(`  [Form POST] Found action: ${formPost.action}`);
          return this.handleFormPost(url, formPost, country, cookies, seen, chain);
        }

        // 到达终点
        console.log(`  [End] No redirect found, returning current URL`);
        const urlSuffix = this.extractUrlSuffix(chain);
        const finalUrl = chain[chain.length - 1];
        const urlObj = new URL(finalUrl);
        return { finalUrl, urlSuffix, domain: urlObj.hostname, redirectChain: chain };
      }
    } catch (e) {
      clearTimeout(timeout);
      const err = e as AxiosError;
      if (err.name === 'CanceledError' || err.code === 'ECONNABORTED') {
        throw new Error(`Request timeout for: ${url}`);
      }
      if (err.response?.status === 301 || err.response?.status === 302) {
        const location = err.response.headers['location'];
        if (location) {
          return this.followRedirect(this.resolveUrl(url, location), country, cookies, seen, chain);
        }
      }
      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        throw new Error(`Proxy connection failed: ${err.code}`);
      }
      throw e;
    }

    return null;
  }

  private async handleFormPost(
    url: string,
    form: { action: string; method: string; params: { [key: string]: string } },
    country: string,
    cookies: { [key: string]: string },
    seen: Set<string>,
    chain: string[]
  ): Promise<LinkResolutionResult | null> {
    const urlKey = url + '|POST';
    if (seen.has(urlKey)) return null;
    seen.add(urlKey);

    const nextUrl = this.resolveUrl(url, form.action);
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    try {
      const response = await axios({
        method: 'POST',
        url: nextUrl,
        data: form.params,
        maxRedirects: 0,
        timeout: 20000,
        headers: {
          'User-Agent': this.randomUserAgent(),
          'Accept-Language': this.randomAcceptLanguage(country),
          'Cookie': cookieStr,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        httpsAgent: this.buildProxyAgent(),
        httpAgent: this.buildProxyAgent(),
        validateStatus: (status) => status !== undefined && status < 600,
      });

      if (response.status === 301 || response.status === 302) {
        const location = response.headers['location'];
        if (location) {
          return this.followRedirect(this.resolveUrl(nextUrl, location), country, cookies, seen, chain);
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private extractJsRedirect(html: string): string | null {
    const patterns = [
      // location.replace(u) 变量形式
      /location\.replace\s*\(\s*(\w+)\s*\)/i,
      // window.location = "URL"
      /window\.location\s*=\s*['"]([^'"]+)['"]/i,
      // window.location.href = "URL"
      /window\.location\.href\s*=\s*['"]([^'"]+)['"]/i,
      // self.location = "URL"
      /self\.location\s*=\s*['"]([^'"]+)['"]/i,
      // top.location = "URL"
      /top\.location\s*=\s*['"]([^'"]+)['"]/i,
      // document.location = "URL"
      /document\.location\s*=\s*['"]([^'"]+)['"]/i,
      // location.replace("URL")
      /location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) {
        // 如果匹配的是变量形式，尝试在函数调用中找到变量值
        if (m[1] && !m[1].includes('://')) {
          const varName = m[1];
          const varPattern = new RegExp(`var\\s+${varName}\\s*=\\s*['"]([^'"]+)['"]`, 'i');
          const varMatch = html.match(varPattern);
          if (varMatch) return varMatch[1];
        }
        return m[1];
      }
    }
    return null;
  }

  private extractMetaRefresh(html: string): string | null {
    const m = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["']?\d+;\s*url\s*=\s*([^"'\s>]+)/i);
    if (m) return m[1];
    const m2 = html.match(/<meta[^>]+content\s*=\s*["']?\d+;\s*url\s*=\s*([^"'\s>]+)[^>]+http-equiv\s*=\s*["']?refresh["']?/i);
    if (m2) return m2[1];
    return null;
  }

  private extractFormPost(html: string): { action: string; method: string; params: { [key: string]: string } } | null {
    const formMatch = html.match(/<form[^>]*>/i);
    if (!formMatch) return null;

    const actionMatch = html.match(/action\s*=\s*["']([^"']+)["']/i);
    const methodMatch = html.match(/method\s*=\s*["']([^"']+)["']/i);
    const inputs: { [key: string]: string } = {};

    // 提取 input 字段
    const inputRegex = /<input[^>]+>/gi;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(html)) !== null) {
      const tag = inputMatch[0];
      const nameMatch = tag.match(/name\s*=\s*["']([^"']+)["']/i);
      const valueMatch = tag.match(/value\s*=\s*["']([^"']*)["']/i);
      if (nameMatch) {
        inputs[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
      }
    }

    return {
      action: actionMatch ? actionMatch[1] : '',
      method: methodMatch ? methodMatch[1] : 'POST',
      params: inputs,
    };
  }

  /**
   * 提取 URL 后缀参数
   * 规则：从最终落地页提取所有追踪参数（UTM + 联盟追踪参数）
   * 最终 URL 格式示例：https://www.brevo.com/landing/?utm_medium=affiliates&utm_source=linkhaitao&sid=lh_xxx
   */
  private extractUrlSuffix(chain: string[]): string {
    // 从跳转链最后一个 URL（最终落地页）提取所有参数
    if (chain.length === 0) return '';

    const finalUrl = chain[chain.length - 1];
    try {
      const urlObj = new URL(finalUrl);
      const searchParams = urlObj.search;
      if (!searchParams) return '';

      // 保留所有参数（UTM + 联盟追踪参数）
      return searchParams.slice(1); // 去掉开头的 ?
    } catch {
      return '';
    }
  }

  private resolveUrl(base: string, relative: string): string {
    if (relative.startsWith('http://') || relative.startsWith('https://')) {
      return relative;
    }
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }

  private randomUserAgent(): string {
    const uaList = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    ];
    return uaList[Math.floor(Math.random() * uaList.length)];
  }

  private randomAcceptLanguage(country: string): string {
    const localeMap: { [key: string]: string } = {
      'US': 'en-US,en;q=0.9',
      'GB': 'en-GB,en;q=0.9',
      'AU': 'en-AU,en;q=0.9',
      'CA': 'en-CA,en;q=0.9',
      'DE': 'de-DE,de;q=0.9,en;q=0.8',
      'FR': 'fr-FR,fr;q=0.9,en;q=0.8',
      'JP': 'ja-JP,ja;q=0.9,en;q=0.8',
      'BR': 'pt-BR,pt;q=0.9,en;q=0.8',
      'IN': 'en-IN,en;q=0.9,hi;q=0.8',
      'ES': 'es-ES,es;q=0.9,en;q=0.8',
      'IT': 'it-IT,it;q=0.9,en;q=0.8',
      'NL': 'nl-NL,nl;q=0.9,en;q=0.8',
      'MX': 'es-MX,es;q=0.9,en;q=0.8',
      'PL': 'pl-PL,pl;q=0.9,en;q=0.8',
      'SE': 'sv-SE,sv;q=0.9,en;q=0.8',
      'NO': 'nb-NO,no;q=0.9,en;q=0.8',
      'DK': 'da-DK,da;q=0.9,en;q=0.8',
      'FI': 'fi-FI,fi;q=0.9,en;q=0.8',
      'PT': 'pt-PT,pt;q=0.9,en;q=0.8',
      'RU': 'ru-RU,ru;q=0.9,en;q=0.8',
      'AR': 'es-AR,es;q=0.9,en;q=0.8',
      'KR': 'ko-KR,ko;q=0.9,en;q=0.8',
      'TH': 'th-TH,th;q=0.9,en;q=0.8',
      'ID': 'id-ID,id;q=0.9,en;q=0.8',
      'VN': 'vi-VN,vi;q=0.9,en;q=0.8',
      'TR': 'tr-TR,tr;q=0.9,en;q=0.8',
      'MY': 'ms-MY,ms;q=0.9,en;q=0.8',
      'PH': 'en-PH,en;q=0.9,tl;q=0.8',
    };
    return localeMap[country] || 'en-US,en;q=0.9';
  }
}
