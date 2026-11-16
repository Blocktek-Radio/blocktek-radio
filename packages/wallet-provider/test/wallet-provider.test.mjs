import test from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import { DevelopmentMockProvider } from '../src/dev-mock.js';
import {
  MidnightConnectorProvider, WalletProviderError,
  canonicalizeIntent, createIntent, verifyCreatorSignature,
} from '../src/index.js';

const now = 1_800_000_000_000;
const commitment = '11'.repeat(32);
const makeIntent = (overrides = {}) => createIntent({ networkId: 'undeployed', creatorAccount: 'mn_addr_creator_synthetic_01', registrationCommitment: commitment,
  manifestCommitment: '22'.repeat(32), nonce: '33'.repeat(32), now, ...overrides });
async function signed(intent) {
  const provider = new DevelopmentMockProvider();
  await provider.connect();
  return provider.signMessage(canonicalizeIntent(intent));
}

test('mock signing verifies canonical local development intent', async () => {
  const intent = makeIntent();
  const response = await signed(intent);
  const verified = verifyCreatorSignature(intent, response, { now: now + 100, expectedNetwork: 'undeployed', expectedAccount: intent.creatorAccount });
  assert.equal(verified.valid, true);
  assert.equal(verified.scheme, 'schnorr_bip340');
  assert.match(verified.warning, /does not establish/);
});

test('development mock cannot initialize in production mode', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => new DevelopmentMockProvider(), (error) => error.code === 'mock_disabled'); }
  finally { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; }
});

test('supported ECDSA/secp256k1 scheme verifies and invalid signature bytes fail', async () => {
  const intent = makeIntent({ nonce: '55'.repeat(32) });
  const canonical = canonicalizeIntent(intent);
  const prefixed = `midnight_signed_message:${new TextEncoder().encode(canonical).length}:${canonical}`;
  const privateKey = new Uint8Array(32).fill(8);
  const signature = secp256k1.sign(new TextEncoder().encode(prefixed), privateKey).toCompactRawBytes();
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  const response = { data: canonical, signature: Buffer.from(signature).toString('hex'), verifyingKey: Buffer.from(publicKey).toString('hex'), scheme: 'ecdsa_secp256k1_sha256' };
  assert.equal(verifyCreatorSignature(intent, response, { now: now + 100 }).scheme, 'ecdsa_secp256k1_sha256');
  assert.throws(() => verifyCreatorSignature(intent, { ...response, signature: '00'.repeat(64) }, { now: now + 100 }), /verification failed/);
});

test('canonical serialization uses a fixed field order and ignores extra input', () => {
  const intent = makeIntent();
  const canonical = canonicalizeIntent(intent);
  assert.equal(canonical, canonicalizeIntent({ ...intent, irrelevant: 'ignored' }));
  assert.deepEqual(Object.keys(JSON.parse(canonical)), ['protocol', 'version', 'networkId', 'creatorAccount', 'registrationCommitment', 'manifestCommitment', 'nonce', 'createdAt', 'expiresAt', 'purpose']);
});

test('cross-domain signature reuse is rejected', async () => {
  const intent = makeIntent(); const response = await signed(intent);
  const otherDomain = structuredClone(intent); otherDomain.protocol = 'other.application';
  assert.throws(() => verifyCreatorSignature(otherDomain, response, { now: now + 100 }), /domain or purpose is unsupported/);
});

for (const [name, edit, code] of [
  ['registration commitment', (i) => { i.registrationCommitment = '44'.repeat(32); }, 'invalid_signature'],
  ['manifest commitment', (i) => { i.manifestCommitment = '44'.repeat(32); }, 'invalid_signature'],
  ['nonce', (i) => { i.nonce = '44'.repeat(32); }, 'replay'],
]) {
  test(`modified ${name} cannot reuse a creator signature`, async () => {
    const original = makeIntent();
    const response = await signed(original);
    const modified = structuredClone(original); edit(modified);
    assert.throws(() => verifyCreatorSignature(modified, response, { now: now + 100, usedNonces: name === 'nonce' ? new Set([modified.nonce]) : new Set() }), (error) => error instanceof WalletProviderError && error.code === code);
  });
}

test('wrong network, account, expiry, replay, encoding and unsupported scheme fail closed', async () => {
  const intent = makeIntent(); const response = await signed(intent);
  for (const options of [
    { expectedNetwork: 'preview' }, { expectedAccount: 'different' }, { now: intent.expiresAt }, { usedNonces: new Set([intent.nonce]) },
  ]) assert.throws(() => verifyCreatorSignature(intent, response, { now: now + 100, ...options }));
  assert.throws(() => verifyCreatorSignature(intent, { ...response, signature: 'not-hex' }, { now: now + 100 }));
  assert.throws(() => verifyCreatorSignature(intent, { ...response, scheme: 'ed25519' }, { now: now + 100 }));
});

test('connector validates reported network and reports user rejection', async () => {
  const base = { name: 'Test connector', apiVersion: '4.1.0', connect: async () => ({
    getConfiguration: async () => ({ networkId: 'undeployed' }), getConnectionStatus: async () => ({ status: 'connected', networkId: 'undeployed' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: 'mn_addr_test_creator_0001' }),
  }) };
  const provider = new MidnightConnectorProvider(base, 'undeployed');
  assert.deepEqual(await provider.connect(), { account: 'mn_addr_test_creator_0001', networkId: 'undeployed' });
  await provider.disconnect();
  const mismatch = new MidnightConnectorProvider(base, 'preview');
  await assert.rejects(mismatch.connect(), (error) => error.code === 'network_mismatch');
  const denied = new MidnightConnectorProvider({ ...base, connect: async () => { throw { code: 'Rejected' }; } }, 'undeployed');
  await assert.rejects(denied.connect(), (error) => error.code === 'user_rejected');
});

test('connector detects account and network changes on state refresh', async () => {
  let address = 'mn_addr_test_creator_0001'; let network = 'undeployed';
  const initial = { name: 'Test connector', apiVersion: '4.1.0', connect: async () => ({
    getConfiguration: async () => ({ networkId: network }), getConnectionStatus: async () => ({ status: 'connected', networkId: network }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: address }),
  }) };
  const provider = new MidnightConnectorProvider(initial, 'undeployed');
  await provider.connect();
  address = 'mn_addr_test_creator_0002';
  assert.equal(await provider.getAccount(), address);
  network = 'preview';
  await assert.rejects(provider.getNetwork(), (error) => error.code === 'network_mismatch');
});

test('provider discovery is safe when no browser connector is available', () => {
  assert.deepEqual(MidnightConnectorProvider.discover(), []);
});

test('unsupported provider versions and missing signData never simulate production signing', async () => {
  assert.throws(() => new MidnightConnectorProvider({ name: 'old', apiVersion: '3.0.0', connect() {} }, 'undeployed'), /does not expose/);
  const provider = new MidnightConnectorProvider({ name: 'no sign', apiVersion: '4.1.0', connect: async () => ({
    getConfiguration: async () => ({ networkId: 'undeployed' }), getConnectionStatus: async () => ({ status: 'connected', networkId: 'undeployed' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: 'mn_addr_test_creator_0001' }),
  }) }, 'undeployed');
  await provider.connect();
  await assert.rejects(provider.signMessage('x'), (error) => error.code === 'unsupported_signing');
});

test('malformed account/signature responses and signing rejection fail closed', async () => {
  const malformed = new MidnightConnectorProvider({ name: 'Malformed', apiVersion: '4.1.0', connect: async () => ({
    getConfiguration: async () => ({ networkId: 'undeployed' }), getConnectionStatus: async () => ({ status: 'connected', networkId: 'undeployed' }),
    getUnshieldedAddress: async () => ({ unshieldedAddress: '' }),
  }) }, 'undeployed');
  await assert.rejects(malformed.connect(), (error) => error.code === 'malformed_response');

  for (const signData of [async () => ({ data: 'wrong', signature: '00', verifyingKey: '00' }), async () => { throw { code: 'Rejected' }; }]) {
    const provider = new MidnightConnectorProvider({ name: 'Signer', apiVersion: '4.1.0', connect: async () => ({
      getConfiguration: async () => ({ networkId: 'undeployed' }), getConnectionStatus: async () => ({ status: 'connected', networkId: 'undeployed' }),
      getUnshieldedAddress: async () => ({ unshieldedAddress: 'mn_addr_test_creator_0001' }), signData,
    }) }, 'undeployed');
    await provider.connect();
    await assert.rejects(provider.signMessage('intent'), (error) => ['malformed_response', 'user_rejected'].includes(error.code));
  }
});
