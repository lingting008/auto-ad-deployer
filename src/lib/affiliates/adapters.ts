import axios from 'axios';
import { AffiliateOffer } from '../types';

export interface AffiliateAdapter {
  readonly name: string;
  fetchOffers(credential: { pid: string; token: string; campaignId?: string }): Promise<AffiliateOffer[]>;
}

/**
 * LinkHouse (lh) 联盟 API 封装
 */
export class LinkHouseAdapter implements AffiliateAdapter {
  readonly name = 'lh';

  async fetchOffers(credential: { pid: string; token: string; campaignId?: string }): Promise<AffiliateOffer[]> {
    const { pid, token, campaignId } = credential;
    const offers: AffiliateOffer[] = [];

    try {
      // 获取已批准的 advertiser 列表
      const response = await axios.get('https://api.linkhouseglobal.com/v1/advertisers', {
        params: {
          publisher_id: pid,
          api_token: token,
          status: 'approved',
        },
        timeout: 15000,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      const data = response.data;
      const advertiserList = data.advertisers || data.data || [];

      for (const adv of advertiserList) {
        const offer: AffiliateOffer = {
          id: adv.id?.toString() || adv.advertiser_id?.toString(),
          name: adv.name || adv.company_name || '',
          primaryUrl: adv.primary_url || adv.link || '',
          clickThroughUrl: adv.click_through_url || adv.tracking_link || '',
          epc: adv.epc || adv.epc_7d || 0,
          categories: adv.categories || [],
        };

        if (offer.id && offer.name) {
          offers.push(offer);
        }
      }
    } catch (e) {
      console.error(`LinkHouse API error: ${(e as Error).message}`);
      throw e;
    }

    return offers;
  }
}

/**
 * PeerFly (pb) 联盟 API 封装
 */
export class PeerFlyAdapter implements AffiliateAdapter {
  readonly name = 'pb';

  async fetchOffers(credential: { pid: string; token: string; campaignId?: string }): Promise<AffiliateOffer[]> {
    const { pid, token } = credential;
    const offers: AffiliateOffer[] = [];

    try {
      const response = await axios.get('https://api.peerfly.com/v2/offers', {
        params: {
          publisher_id: pid,
          api_key: token,
          status: 'active',
          limit: 1000,
        },
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = response.data;
      const offerList = data.offers || data.data || [];

      for (const offer of offerList) {
        const item: AffiliateOffer = {
          id: offer.id?.toString(),
          name: offer.name || offer.title || '',
          primaryUrl: offer.preview_url || offer.primary_url || '',
          clickThroughUrl: offer.tracking_link || offer.click_url || '',
          epc: offer.epc || 0,
          categories: offer.categories || [],
        };

        if (item.id && item.name) {
          offers.push(item);
        }
      }
    } catch (e) {
      console.error(`PeerFly API error: ${(e as Error).message}`);
      throw e;
    }

    return offers;
  }
}

/**
 * Generic 联盟 API 封装（可扩展用于其他平台）
 */
export class GenericAdapter implements AffiliateAdapter {
  readonly name = 'generic';

  async fetchOffers(credential: { pid: string; token: string; campaignId?: string }): Promise<AffiliateOffer[]> {
    const { pid, token, campaignId } = credential;
    const offers: AffiliateOffer[] = [];

    // 通用模式：Bearer Token 认证
    const headers: { [key: string]: string } = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    try {
      // 尝试常见的端点
      const endpoints = [
        { url: `https://api.${credential.pid}.com/v1/advertisers`, params: { api_token: token } },
        { url: `https://api.${credential.pid}.com/offers`, params: { api_key: token } },
      ];

      for (const ep of endpoints) {
        try {
          const response = await axios.get(ep.url, {
            params: ep.params,
            headers,
            timeout: 10000,
          });

          const items = response.data.advertisers || response.data.offers || response.data.data || [];
          for (const item of items) {
            const offer: AffiliateOffer = {
              id: item.id?.toString() || item.offer_id?.toString(),
              name: item.name || item.title || '',
              primaryUrl: item.primary_url || item.preview_url || '',
              clickThroughUrl: item.click_url || item.tracking_link || '',
              epc: item.epc || 0,
              categories: item.categories || [],
            };
            if (offer.id && offer.name) offers.push(offer);
          }
          break;
        } catch (e) {
          // try next endpoint
        }
      }

      // 如果所有端点都失败，抛出异常
      if (offers.length === 0) {
        throw new Error(`Generic API: No offers retrieved from any endpoint for publisher ${pid}`);
      }
    } catch (e) {
      console.error(`Generic API error: ${(e as Error).message}`);
      throw e;
    }

    return offers;
  }
}
