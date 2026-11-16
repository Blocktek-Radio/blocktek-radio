import { secp256k1, schnorr } from '@noble/curves/secp256k1';

export const PROTOCOL_ID = 'audiotrust.creator-registration';
export const PROTOCOL_VERSION = 1;
export const SIGNING_PREFIX = 'midnight_signed_message:';
export const SUPPORTED_CONNECTOR_API = /^4\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export class WalletProviderError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WalletProviderError';
    this.code = code;
  }
}

const connectorError = (error) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'Rejected') return new WalletProviderError('user_rejected', 'The wallet request was declined.', error);
  if (code === 'PermissionRejected') return new WalletProviderError('permission_rejected', 'The wallet has not granted this permission.', error);
  if (code === 'Disconnected') return new WalletProviderError('disconnected', 'The wallet connection was lost.', error);
  return new WalletProviderError('provider_error', 'The wallet request failed.', error);
};

const validWallet = (wallet) => wallet && typeof wallet.name === 'string' &&
  typeof wallet.apiVersion === 'string' && SUPPORTED_CONNECTOR_API.test(wallet.apiVersion) &&
  typeof wallet.connect === 'function';

/** @returns {import('@midnightntwrk/dapp-connector-api').InitialAPI[]} */
export function discoverMidnightWallets() {
  if (typeof window === 'undefined' || !window.midnight) return [];
  return Object.values(window.midnight).filter(validWallet);
}

/** Midnight DApp Connector adapter. 1AM is usable only if it exposes this verified API. */
export class MidnightConnectorProvider {
  constructor(initialApi, networkId) {
    if (!validWallet(initialApi)) throw new WalletProviderError('unsupported_wallet', 'This wallet does not expose a supported Midnight DApp Connector API.');
    this.initialApi = initialApi;
    this.networkId = networkId;
    this.connected = null;
    this.account = null;
    this.listeners = new Set();
  }

  static discover() { return discoverMidnightWallets(); }
  get providerName() { return this.initialApi.name; }
  get capabilities() {
    return { connect: true, disconnect: true, getAccount: true, getNetwork: true,
      accountChanges: false, networkChanges: false,
      signMessage: Boolean(this.connected && typeof this.connected.signData === 'function') };
  }

  async connect() {
    try {
      const api = await this.initialApi.connect(this.networkId);
      const [configuration, status, address] = await Promise.all([
        api.getConfiguration(), api.getConnectionStatus(), api.getUnshieldedAddress(),
      ]);
      if (!configuration || configuration.networkId !== this.networkId || status?.status !== 'connected' || status.networkId !== this.networkId) {
        throw new WalletProviderError('network_mismatch', `Wallet must be connected to ${this.networkId}.`);
      }
      if (!address || typeof address.unshieldedAddress !== 'string' || address.unshieldedAddress.length < 8) {
        throw new WalletProviderError('malformed_response', 'Wallet returned a malformed unshielded account.');
      }
      this.connected = api;
      this.account = address.unshieldedAddress;
      this.emit({ type: 'connected', account: this.account, networkId: this.networkId });
      return { account: this.account, networkId: this.networkId };
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw connectorError(error);
    }
  }

  async disconnect() {
    const previousAccount = this.account;
    this.connected = null;
    this.account = null;
    this.emit({ type: 'disconnected', previousAccount });
  }

  async getAccount() {
    this.assertConnected();
    const current = await this.connected.getUnshieldedAddress();
    if (!current || typeof current.unshieldedAddress !== 'string') throw new WalletProviderError('malformed_response', 'Wallet returned a malformed account.');
    if (current.unshieldedAddress !== this.account) {
      const previousAccount = this.account;
      this.account = current.unshieldedAddress;
      this.emit({ type: 'account_changed', account: this.account, previousAccount });
    }
    return this.account;
  }

  async getNetwork() {
    this.assertConnected();
    try {
      const [configuration, status] = await Promise.all([this.connected.getConfiguration(), this.connected.getConnectionStatus()]);
      if (configuration?.networkId !== this.networkId || status?.status !== 'connected' || status.networkId !== this.networkId) {
        await this.disconnect();
        throw new WalletProviderError('network_mismatch', `Wallet changed network; expected ${this.networkId}.`);
      }
      return configuration.networkId;
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw connectorError(error);
    }
  }

  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async signMessage(text) {
    this.assertConnected();
    if (typeof this.connected.signData !== 'function') throw new WalletProviderError('unsupported_signing', 'This wallet does not support Midnight signData.');
    try {
      const result = await this.connected.signData(text, { encoding: 'text', keyType: 'unshielded' });
      if (!result || result.data !== text || typeof result.signature !== 'string' || typeof result.verifyingKey !== 'string') {
        throw new WalletProviderError('malformed_response', 'Wallet returned a malformed signature.');
      }
      return result;
    } catch (error) {
      if (error instanceof WalletProviderError) throw error;
      throw connectorError(error);
    }
  }

  assertConnected() {
    if (!this.connected || !this.account) throw new WalletProviderError('not_connected', 'Connect a wallet before continuing.');
  }
  emit(event) { for (const listener of this.listeners) listener(event); }
}

const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => {
  if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new WalletProviderError('invalid_signature', 'Signature fields must be even-length hexadecimal.');
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => parseInt(byte, 16));
};

export function canonicalizeIntent(intent) {
  const required = ['protocol', 'version', 'networkId', 'creatorAccount', 'registrationCommitment', 'manifestCommitment', 'nonce', 'createdAt', 'expiresAt', 'purpose'];
  if (!intent || required.some((key) => !(key in intent))) throw new WalletProviderError('invalid_intent', 'Signing intent is missing a required field.');
  if (intent.protocol !== PROTOCOL_ID || intent.version !== PROTOCOL_VERSION || intent.purpose !== 'approve_registration') throw new WalletProviderError('invalid_intent', 'Signing intent domain or purpose is unsupported.');
  if (typeof intent.networkId !== 'string' || !intent.networkId || intent.networkId.length > 128) throw new WalletProviderError('invalid_intent', 'networkId is invalid.');
  if (typeof intent.creatorAccount !== 'string' || !intent.creatorAccount || intent.creatorAccount.length > 256) throw new WalletProviderError('invalid_intent', 'creatorAccount is invalid.');
  for (const key of ['registrationCommitment', 'manifestCommitment']) if (!/^[a-f0-9]{64}$/.test(intent[key])) throw new WalletProviderError('invalid_intent', `${key} must be a lowercase 32-byte hex digest.`);
  if (!/^[a-f0-9]{64}$/.test(intent.nonce)) throw new WalletProviderError('invalid_intent', 'nonce must be 32 random bytes in lowercase hex.');
  if (!Number.isSafeInteger(intent.createdAt) || !Number.isSafeInteger(intent.expiresAt) || intent.expiresAt <= intent.createdAt) throw new WalletProviderError('invalid_intent', 'Signing intent timestamps are invalid.');
  return JSON.stringify({
    protocol: intent.protocol, version: intent.version, networkId: intent.networkId,
    creatorAccount: intent.creatorAccount, registrationCommitment: intent.registrationCommitment,
    manifestCommitment: intent.manifestCommitment, nonce: intent.nonce,
    createdAt: intent.createdAt, expiresAt: intent.expiresAt, purpose: intent.purpose,
  });
}

export function prefixedMessage(text) {
  const size = new TextEncoder().encode(text).length;
  return `${SIGNING_PREFIX}${size}:${text}`;
}

/** Verify Midnight DApp Connector signData response. Does not prove that its key maps to the address string. */
export function verifyCreatorSignature(intent, response, { now = Date.now(), expectedNetwork, expectedAccount, usedNonces = new Set() } = {}) {
  const canonical = canonicalizeIntent(intent);
  if (intent.expiresAt <= now) throw new WalletProviderError('expired_intent', 'Signing intent has expired.');
  if (intent.createdAt > now + 60_000) throw new WalletProviderError('invalid_intent', 'Signing intent creation time is in the future.');
  if (expectedNetwork && intent.networkId !== expectedNetwork) throw new WalletProviderError('network_mismatch', 'Signing intent network does not match the required network.');
  if (expectedAccount && intent.creatorAccount !== expectedAccount) throw new WalletProviderError('account_mismatch', 'Signing intent account does not match the connected account.');
  if (usedNonces.has(intent.nonce)) throw new WalletProviderError('replay', 'Signing intent nonce has already been used.');
  if (!response || response.data !== canonical) throw new WalletProviderError('invalid_signature', 'Signature response is not bound to this canonical intent.');
  const scheme = response.scheme ?? 'schnorr_bip340';
  if (scheme !== 'schnorr_bip340' && scheme !== 'ecdsa_secp256k1_sha256') throw new WalletProviderError('unsupported_signature', 'Wallet signature scheme is unsupported.');
  const signature = fromHex(response.signature);
  const key = fromHex(response.verifyingKey);
  if (signature.length !== 64) throw new WalletProviderError('invalid_signature', 'Wallet signature must be 64 bytes.');
  const message = new TextEncoder().encode(prefixedMessage(canonical));
  let valid = false;
  try {
    valid = scheme === 'schnorr_bip340'
      ? key.length === 32 && schnorr.verify(signature, message, key)
      : key.length === 33 && secp256k1.verify(signature, message, key, { lowS: false });
  } catch {
    valid = false;
  }
  if (!valid) throw new WalletProviderError('invalid_signature', 'Creator signature verification failed.');
  return { valid: true, signerKey: bytesToHex(key), scheme, nonce: intent.nonce, warning: 'Signer key is verified; this adapter does not establish that the key cryptographically derives the stated Midnight address.' };
}

export function createIntent({ networkId, creatorAccount, registrationCommitment, manifestCommitment, nonce, now = Date.now(), ttlMs = 5 * 60_000 }) {
  const intent = { protocol: PROTOCOL_ID, version: PROTOCOL_VERSION, networkId, creatorAccount,
    registrationCommitment, manifestCommitment, nonce: nonce ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
    createdAt: now, expiresAt: now + ttlMs, purpose: 'approve_registration' };
  canonicalizeIntent(intent);
  return intent;
}
