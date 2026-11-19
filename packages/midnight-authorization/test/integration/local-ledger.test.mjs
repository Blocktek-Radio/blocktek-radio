import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as runtime from '@midnight-ntwrk/compact-runtime';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-js';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime';
import {
  FluentWalletBuilder,
  inMemoryPrivateStateProvider,
  MidnightWalletProvider,
  syncWallet,
} from '@midnight-ntwrk/testkit-js';
import { firstValueFrom, filter, timeout } from 'rxjs';
import pino from 'pino';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Contract, ledger } from '../../artifacts/contract/contract/index.js';

globalThis.WebSocket = WebSocket;

const NETWORK_ID = 'undeployed';
const TEST_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const issuerSecret = new Uint8Array(32).fill(7);
const issuerId = new Uint8Array(32).fill(1);
const chainTime = () => BigInt(Math.floor(Date.now() / 1000));
const pad = (s) => {
  const b = new TextEncoder().encode(s);
  const out = new Uint8Array(32);
  out.set(b);
  return out;
};
const bytes = (n) => new Uint8Array(32).fill(n);
const point = (b) => ed25519.ExtendedPoint.fromBytes(b).toAffine();
const littleEndianBigInt = (b) => BigInt(`0x${Buffer.from(b).reverse().toString('hex')}`);
const compactSignature = (b) => ({ r: point(b.slice(0, 32)), s: littleEndianBigInt(b.slice(32)) });
const contractForHashing = new Contract({});
const artifactPath = fileURLToPath(new URL('../../artifacts/contract', import.meta.url));
const addressPath = path.resolve(artifactPath, 'deployment-address.local.json');
const evidencePath = path.resolve(
  process.env.AUDIOTRUST_EVIDENCE_PATH ?? path.resolve(artifactPath, '../results/local-ledger-evidence.json'),
);
const evidence = {
  evidenceKind: 'ledger-9-local-integration',
  networkId: NETWORK_ID,
  testStartedAt: new Date().toISOString(),
  contractVersion: 'AudioTrustPublisherAuthorization / Compact 0.36.0',
  contractAddress: null,
  scenarios: [],
  transactionIds: [],
};

const config = {
  networkId: NETWORK_ID,
  node: 'http://127.0.0.1:9944',
  nodeWS: 'ws://127.0.0.1:9944',
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? 'http://127.0.0.1:6300',
  faucet: '',
};
const env = {
  walletNetworkId: NETWORK_ID,
  networkId: NETWORK_ID,
  node: config.node,
  nodeWS: config.nodeWS,
  indexer: config.indexer,
  indexerWS: config.indexerWS,
  proofServer: config.proofServer,
  faucet: '',
};
const logger = pino({ level: process.env.LOG_LEVEL ?? 'warn' });
const compiled = CompiledContract.make('AudioTrustPublisherAuthorization', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(artifactPath),
);
let contractAddress;
let wallet;
let providers;
let currentIssuerSecret = issuerSecret;
let currentPolicyVersion = 1n;

function makeProviders() {
  const zkConfigProvider = new NodeZkConfigProvider(artifactPath);
  return {
    privateStateProvider: inMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: wallet,
    midnightProvider: wallet,
    config: { networkId: NETWORK_ID, ttlSeconds: 3600 },
  };
}

async function readLedger() {
  const read = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!read) throw new Error(`Indexer has no state for deployed contract ${contractAddress}`);
  if (read.contractState.era !== 'v9') throw new Error(`Expected ledger v9, got ${read.contractState.era}`);
  return ledger(read.contractState.deserialize({ v9: ContractState }).data);
}

function record(name, outcome, details = {}) {
  evidence.scenarios.push({
    name,
    inputCategory: 'synthetic deterministic test data',
    proofGeneration: outcome === 'ACCEPTED' ? 'GENERATED' : 'FAILED_BEFORE_SUBMISSION',
    transactionSubmission: outcome === 'ACCEPTED' ? 'SUBMITTED_AND_FINALIZED' : 'NOT_SUBMITTED',
    ledgerOutcome: outcome,
    ...details,
  });
}

function transactionEvidence(tx, kind) {
  const pub = kind === 'deploy' ? tx.deployTxData.public : tx.public;
  const txId = pub.txId ?? null;
  const result = { txId, blockHeight: pub.blockHeight ?? null };
  if (txId) evidence.transactionIds.push({ kind, txId, blockHeight: result.blockHeight });
  return result;
}

async function expectMiscEvent(tx, expectedName, eventLabel) {
  // Contract-event filters use the 32-byte chain hash, while a submitted
  // transaction's public txId is an SDK identifier and may have a prefix.
  const finalized = await providers.publicDataProvider.watchForTxData(tx.public.txId);
  const transactionHash = finalized.txHash;
  const events = await providers.publicDataProvider.queryContractEvents({
    contractAddress,
    transactionHash,
    types: ['Misc'],
  });
  expect(events, `${eventLabel} must be indexed for its transaction`).toHaveLength(1);
  expect(events[0].eventType).toBe('Misc');
  const hex = (bytes) => Buffer.from(bytes).toString('hex');
  const actualName = events[0].name.replace(/^0x/i, '').toLowerCase();
  expect(actualName).toBe(hex(expectedName));
  return { eventType: events[0].eventType, name: events[0].name, payload: events[0].payload };
}

function padded(text, length) {
  const out = Buffer.alloc(length);
  Buffer.from(text, 'utf8').copy(out);
  return out;
}

function credential(overrides = {}, signingSecret = currentIssuerSecret) {
  const issuedAt = chainTime() - 5n;
  const statement = {
    domain: pad('AudioTrust:credential:v1'),
    contractContext: runtime.encodeContractAddress(contractAddress),
    issuerId,
    schemaVersion: 1n,
    subjectCommitment: bytes(2),
    individualVerified: true,
    organizationMember: true,
    publisherAuthorized: true,
    issuedAt,
    expiresAt: issuedAt + 900n,
    registrationCommitment: bytes(3),
    policyVersion: currentPolicyVersion,
    nonce: bytes(4),
    revocationHandle: bytes(5),
    ...overrides,
  };
  const digest = contractForHashing._persistentHash_0(statement);
  return { statement, signature: compactSignature(ed25519.sign(digest, signingSecret)) };
}

async function expectCircuitRejection(name, circuitId, args, reason) {
  const before = await readLedger();
  let error;
  try {
    await submitCallTx(providers, {
      compiledContract: compiled,
      contractAddress,
      privateStateId: 'AudioTrustLocalIntegration',
      circuitId,
      args,
    });
  } catch (caught) {
    error = caught;
  }
  expect(error, `${name} must fail before a transaction is submitted`).toBeTruthy();
  if (reason) expect(String(error)).toContain(reason);
  const after = await readLedger();
  expect(after.consumedNullifiers.size()).toBe(before.consumedNullifiers.size());
  expect(after.consumedIssuerUpdateNonces.size()).toBe(before.consumedIssuerUpdateNonces.size());
  record(name, 'REJECTED_BY_CIRCUIT', { reason: reason || 'malformed input rejected before ledger mutation', resultingState: 'consumed nullifier count unchanged' });
}

async function issuerUpdate(update, signingSecret = currentIssuerSecret) {
  const sig = compactSignature(ed25519.sign(contractForHashing._persistentHash_2(update), signingSecret));
  const tx = await submitCallTx(providers, {
    compiledContract: compiled,
    contractAddress,
    privateStateId: 'AudioTrustLocalIntegration',
    circuitId: 'updateIssuer',
    args: [update, sig],
  });
  return tx;
}

describe('AudioTrustPublisherAuthorization on local Ledger 9', () => {
  beforeAll(async () => {
    const builder = FluentWalletBuilder.forEnvironment(env).withSeed(TEST_SEED);
    const built = await builder.buildWithoutStarting();
    wallet = await MidnightWalletProvider.withWallet(logger, env, built.wallet, built.seeds, built.keystore);
    await wallet.start(false);
    await syncWallet(wallet.wallet, 0, 10 * 60_000);
    await firstValueFrom(
      wallet.wallet.state().pipe(
        filter((state) => state.dust.availableCoins.length > 0),
        timeout({ each: 10 * 60_000 }),
      ),
    );
    providers = makeProviders();
  }, 15 * 60_000);

  afterAll(async () => {
    evidence.testFinishedAt = new Date().toISOString();
    evidence.status = contractAddress && evidence.scenarios.length
      ? 'EXECUTED_REQUIRES_TEST_RUNNER_SUMMARY'
      : 'SETUP_FAILED';
    mkdirSync(path.dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
    if (wallet) await wallet.stop().catch((error) => logger.warn({ error: String(error) }, 'wallet stop failed'));
  });

  it('deploys and initializes the issuer on ledger', async () => {
    const publicKey = point(ed25519.getPublicKey(issuerSecret));
    const deployed = await deployContract(providers, {
      compiledContract: compiled,
      privateStateId: 'AudioTrustLocalIntegration',
      initialPrivateState: {},
      args: [issuerId, publicKey],
    });
    contractAddress = deployed.deployTxData.public.contractAddress;
    evidence.contractAddress = contractAddress;
    evidence.deployment = transactionEvidence(deployed, 'deploy');
    writeFileSync(addressPath, `${JSON.stringify({ networkId: NETWORK_ID, contractAddress, deployedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    const state = await readLedger();
    expect(state.issuerActive).toBe(true);
    expect(state.policyVersion).toBe(1n);
    expect(state.consumedNullifiers.size()).toBe(0n);
    record('initial issuer configuration', 'ACCEPTED', { deployment: evidence.deployment, resultingState: 'issuer active; policy version 1' });
  });

  it('accepts a valid authorization and rejects the same request replay', async () => {
    const valid = credential();
    const tx = await submitCallTx(providers, {
      compiledContract: compiled,
      contractAddress,
      privateStateId: 'AudioTrustLocalIntegration',
      circuitId: 'authorizeRegistration',
      args: [valid.statement, valid.signature],
    });
    const txEvidence = transactionEvidence(tx, 'authorization');
    expect((await readLedger()).consumedNullifiers.size()).toBe(1n);
    const authorizationNullifier = [...(await readLedger()).consumedNullifiers][0][0];
    const event = await expectMiscEvent(tx, authorizationNullifier, 'publisher authorization');
    expect(event.payload.replace(/^0x/i, '').toLowerCase()).toBe(padded('AudioTrust:publisher-authorized:v1', 256).toString('hex'));
    record('valid BlockTek eligibility authorization', 'ACCEPTED', { ...txEvidence, event, resultingState: 'one request nullifier' });
    await expectCircuitRejection('replayed request nullifier', 'authorizeRegistration', [valid.statement, valid.signature], 'registration authorization replayed');
    expect((await readLedger()).consumedNullifiers.size()).toBe(1n);
  });

  it('rejects invalid claims, issuer, signature, expiry, context, and malformed commitments', async () => {
    const current = chainTime();
    const longLeaseStart = current - 5n;
    const cases = [
      ['wrong issuer', { issuerId: bytes(9) }, null, 'wrong issuer'],
      ['missing identity claim', { individualVerified: false }, null, 'individual identity claim required'],
      ['missing organization claim', { organizationMember: false }, null, 'organization membership claim required'],
      ['missing publisher claim', { publisherAuthorized: false }, null, 'publisher authorization claim required'],
      ['expired credential', { issuedAt: current - 900n, expiresAt: current - 1n }, null, 'credential expired'],
      ['status attestation lifetime over fifteen minutes', { issuedAt: longLeaseStart, expiresAt: longLeaseStart + 901n }, null, 'fifteen-minute lifetime'],
      ['not-yet-valid credential', { issuedAt: current + 600n }, null, 'credential is not yet valid'],
      ['invalid request binding', { contractContext: bytes(17) }, null, 'wrong contract context'],
    ];
    for (const [name, overrides, _unused, reason] of cases) {
      const item = credential({ ...overrides, registrationCommitment: bytes(30), nonce: bytes(31) });
      await expectCircuitRejection(name, 'authorizeRegistration', [item.statement, item.signature], reason);
    }
    const badSignature = credential({ registrationCommitment: bytes(32), nonce: bytes(33) });
    badSignature.signature.s = (badSignature.signature.s + 1n) % runtime.MAX_CURVE25519_SCALAR;
    await expectCircuitRejection('invalid issuer signature', 'authorizeRegistration', [badSignature.statement, badSignature.signature], 'invalid issuer signature');
    const malformed = credential({ registrationCommitment: new Uint8Array(31), nonce: bytes(34) });
    await expectCircuitRejection('malformed commitment', 'authorizeRegistration', [malformed.statement, malformed.signature], '');
  });

  it('accepts a fresh request lease without publishing a stable credential handle', async () => {
    const next = credential({ registrationCommitment: bytes(35), nonce: bytes(36), revocationHandle: bytes(37) });
    const accepted = await submitCallTx(providers, {
      compiledContract: compiled,
      contractAddress,
      privateStateId: 'AudioTrustLocalIntegration',
      circuitId: 'authorizeRegistration',
      args: [next.statement, next.signature],
    });
    record('independent registration request', 'ACCEPTED', { ...transactionEvidence(accepted, 'authorization'), resultingState: 'two request nullifiers' });

    const sameHandleDifferentRequest = credential({
      registrationCommitment: bytes(45),
      nonce: bytes(46),
      revocationHandle: next.statement.revocationHandle,
    });
    const scoped = await submitCallTx(providers, {
      compiledContract: compiled,
      contractAddress,
      privateStateId: 'AudioTrustLocalIntegration',
      circuitId: 'authorizeRegistration',
      args: [sameHandleDifferentRequest.statement, sameHandleDifferentRequest.signature],
    });
    record('freshly issuer-attested distinct registration with the same private handle', 'ACCEPTED', {
      ...transactionEvidence(scoped, 'authorization'),
      resultingState: 'no credential handle or stable revocation identifier is public; operational revocation must stop new attestations, and previous attestations expire within fifteen minutes',
    });
  });

  it('enforces issuer update authorization, suspension, reinstatement, and rotation', async () => {
    const unauthorized = {
      domain: pad('AudioTrust:issuer-update:v1'),
      contractContext: runtime.encodeContractAddress(contractAddress),
      nextIssuerId: issuerId,
      nextIssuerPublicKey: point(ed25519.getPublicKey(issuerSecret)),
      nextActive: true,
      nextPolicyVersion: currentPolicyVersion,
      nonce: bytes(39),
    };
    await expectCircuitRejection('unauthorized issuer update', 'updateIssuer', [unauthorized, compactSignature(ed25519.sign(contractForHashing._persistentHash_2(unauthorized), bytes(99)))], 'unauthorized issuer update');

    const suspended = { ...unauthorized, nextActive: false, nonce: bytes(40) };
    const suspendTx = await issuerUpdate(suspended);
    const replaySignature = compactSignature(ed25519.sign(contractForHashing._persistentHash_2(suspended), currentIssuerSecret));
    await expectCircuitRejection('replayed issuer update nonce', 'updateIssuer', [suspended, replaySignature], 'issuer update nonce already consumed');
    const issuerEvent = await expectMiscEvent(suspendTx, issuerId, 'issuer update');
    expect(issuerEvent.payload.replace(/^0x/i, '').toLowerCase()).toBe(padded('AudioTrust:issuer-update:v1', 256).toString('hex'));
    record('issuer suspension', 'ACCEPTED', { ...transactionEvidence(suspendTx, 'issuer-update'), event: issuerEvent });
    const blocked = credential({ registrationCommitment: bytes(41), nonce: bytes(42) });
    await expectCircuitRejection('authorization while issuer suspended', 'authorizeRegistration', [blocked.statement, blocked.signature], 'issuer suspended');

    const reinstated = { ...suspended, nextActive: true, nonce: bytes(43) };
    const reinstateTx = await issuerUpdate(reinstated);
    const reinstateEvent = await expectMiscEvent(reinstateTx, issuerId, 'issuer reinstatement');
    record('issuer reinstatement', 'ACCEPTED', { ...transactionEvidence(reinstateTx, 'issuer-update'), event: reinstateEvent });
    const replacementSecret = new Uint8Array(32).fill(18);
    const rotated = {
      ...reinstated,
      nextIssuerPublicKey: point(ed25519.getPublicKey(replacementSecret)),
      nextPolicyVersion: 2n,
      nonce: bytes(44),
    };
    const rotationTx = await issuerUpdate(rotated);
    const rotationEvent = await expectMiscEvent(rotationTx, issuerId, 'issuer rotation');
    record('issuer key rotation', 'ACCEPTED', { ...transactionEvidence(rotationTx, 'issuer-update'), event: rotationEvent });
    currentIssuerSecret = replacementSecret;
    currentPolicyVersion = 2n;
    const oldSigned = credential({ registrationCommitment: bytes(45), nonce: bytes(46) }, issuerSecret);
    await expectCircuitRejection('authorization using old issuer key after rotation', 'authorizeRegistration', [oldSigned.statement, oldSigned.signature], 'invalid issuer signature');
  });
});
