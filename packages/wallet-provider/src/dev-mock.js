import { schnorr } from '@noble/curves/secp256k1';
import { prefixedMessage, WalletProviderError } from './index.js';

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Isolated synthetic provider for development and unit tests. Never include as a production wallet choice. */
export class DevelopmentMockProvider {
  constructor({ privateKey, account = 'mn_addr_test_creator_0001', networkId = 'undeployed' } = {}) {
    if (process.env.NODE_ENV === 'production') throw new WalletProviderError('mock_disabled', 'Development mock wallets are disabled in production.');
    this.privateKey = privateKey ?? new Uint8Array(32).fill(7);
    this.account = account;
    this.networkId = networkId;
    this.connected = false;
  }
  get providerName() { return 'Development mock (test only)'; }
  get capabilities() { return { connect: true, disconnect: true, getAccount: true, getNetwork: true, accountChanges: false, networkChanges: false, signMessage: true }; }
  async connect() { this.connected = true; return { account: this.account, networkId: this.networkId }; }
  async disconnect() { this.connected = false; }
  async getAccount() { if (!this.connected) throw new WalletProviderError('not_connected', 'Connect a wallet before continuing.'); return this.account; }
  async getNetwork() { if (!this.connected) throw new WalletProviderError('not_connected', 'Connect a wallet before continuing.'); return this.networkId; }
  async signMessage(text) {
    if (!this.connected) throw new WalletProviderError('not_connected', 'Connect a wallet before continuing.');
    const prefixed = prefixedMessage(text);
    return { data: text, signature: bytesToHex(schnorr.sign(new TextEncoder().encode(prefixed), this.privateKey)), verifyingKey: bytesToHex(schnorr.getPublicKey(this.privateKey)), scheme: 'schnorr_bip340' };
  }
}
