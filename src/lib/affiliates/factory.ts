import { AffiliateAdapter, LinkHouseAdapter, PeerFlyAdapter, GenericAdapter, PartnermaticAdapter } from './adapters';

export class AffiliateFactory {
  private static adapters: { [name: string]: AffiliateAdapter } = {
    'lh': new LinkHouseAdapter(),
    'linkhouse': new LinkHouseAdapter(),
    'pb': new PeerFlyAdapter(),
    'peerfly': new PeerFlyAdapter(),
    'pm': new PartnermaticAdapter(),
    'partnermatic': new PartnermaticAdapter(),
    'generic': new GenericAdapter(),
  };

  static getAdapter(name: string): AffiliateAdapter {
    const key = name.toLowerCase();
    if (!this.adapters[key]) {
      throw new Error(`Unknown affiliate: ${name}. Supported: ${Object.keys(this.adapters).join(', ')}`);
    }
    return this.adapters[key];
  }

  static registerAdapter(name: string, adapter: AffiliateAdapter): void {
    this.adapters[name.toLowerCase()] = adapter;
  }

  static getSupportedAffiliates(): string[] {
    return Object.keys(this.adapters);
  }
}
