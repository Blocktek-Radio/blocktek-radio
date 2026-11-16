import type { ProviderCapabilities } from './index.js';
export class DevelopmentMockProvider {
  constructor(options?: { privateKey?: Uint8Array; account?: string; networkId?: string });
  readonly providerName: string;
  readonly capabilities: ProviderCapabilities;
  connect(): Promise<{ account: string; networkId: string }>;
  disconnect(): Promise<void>;
  getAccount(): Promise<string>;
  getNetwork(): Promise<string>;
  signMessage(text: string): Promise<import('@midnightntwrk/dapp-connector-api').Signature>;
}
