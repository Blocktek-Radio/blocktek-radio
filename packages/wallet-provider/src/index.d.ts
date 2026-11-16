import type { InitialAPI, Signature } from '@midnightntwrk/dapp-connector-api';

export const PROTOCOL_ID: 'audiotrust.creator-registration';
export const PROTOCOL_VERSION: 1;
export const SIGNING_PREFIX: 'midnight_signed_message:';
export class WalletProviderError extends Error { code: string }
export type WalletEvent =
  | { type: 'connected'; account: string; networkId: string }
  | { type: 'disconnected'; previousAccount: string | null }
  | { type: 'account_changed'; account: string; previousAccount: string | null };
export type ProviderCapabilities = {
  connect: boolean; disconnect: boolean; getAccount: boolean; getNetwork: boolean;
  accountChanges: boolean; networkChanges: boolean; signMessage: boolean;
};
export function discoverMidnightWallets(): InitialAPI[];
export class MidnightConnectorProvider {
  constructor(initialApi: InitialAPI, networkId: string);
  readonly providerName: string;
  readonly capabilities: ProviderCapabilities;
  connect(): Promise<{ account: string; networkId: string }>;
  disconnect(): Promise<void>;
  getAccount(): Promise<string>;
  getNetwork(): Promise<string>;
  onChange(listener: (event: WalletEvent) => void): () => void;
  signMessage(text: string): Promise<Signature>;
  static discover(): InitialAPI[];
}
export type CreatorIntent = {
  protocol: string; version: number; networkId: string; creatorAccount: string;
  registrationCommitment: string; manifestCommitment: string; nonce: string;
  createdAt: number; expiresAt: number; purpose: string;
};
export function canonicalizeIntent(intent: CreatorIntent): string;
export function prefixedMessage(text: string): string;
export function createIntent(input: {
  networkId: string; creatorAccount: string; registrationCommitment: string; manifestCommitment: string;
  nonce?: string; now?: number; ttlMs?: number;
}): CreatorIntent;
export function verifyCreatorSignature(intent: CreatorIntent, response: Signature, options?: {
  now?: number; expectedNetwork?: string; expectedAccount?: string; usedNonces?: Set<string>;
}): { valid: true; signerKey: string; scheme: 'schnorr_bip340' | 'ecdsa_secp256k1_sha256'; nonce: string; warning: string };
