import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as runtime from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../artifacts/contract/contract/index.js';

const now = BigInt(Math.floor(Date.now() / 1000));
const bytes = (value) => new Uint8Array(32).fill(value);
const pad = (value) => {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(32);
  out.set(encoded);
  return out;
};
const point = (encoded) => ed25519.ExtendedPoint.fromBytes(encoded).toAffine();
const littleEndianBigInt = (encoded) =>
  BigInt(`0x${Buffer.from(encoded).reverse().toString('hex')}`);
const parsedSignature = (signature) => ({
  r: point(signature.slice(0, 32)),
  s: littleEndianBigInt(signature.slice(32)),
});

async function setup() {
  const secretKey = new Uint8Array(32).fill(7);
  const publicKey = point(ed25519.getPublicKey(secretKey));
  const issuerId = bytes(1);
  const contract = new Contract({});
  const address = runtime.sampleContractAddress();
  const constructor = await contract.initialState(
    runtime.createConstructorContext(undefined, runtime.sampleUserAddress()),
    issuerId,
    publicKey,
  );
  return {
    secretKey,
    publicKey,
    issuerId,
    contract,
    address,
    state: constructor.currentContractState.data,
  };
}

function makeCredential(fixture, overrides = {}) {
  const statement = {
    domain: pad('AudioTrust:credential:v1'),
    contractContext: runtime.encodeContractAddress(fixture.address),
    issuerId: fixture.issuerId,
    schemaVersion: 1n,
    subjectCommitment: bytes(2),
    individualVerified: true,
    organizationMember: true,
    publisherAuthorized: true,
    issuedAt: now - 60n,
    expiresAt: now + 3600n,
    registrationCommitment: bytes(3),
    policyVersion: 1n,
    nonce: bytes(4),
    revocationHandle: bytes(5),
    ...overrides,
  };
  // This generated helper applies the Compact 0.36 PersistentHash type
  // descriptor, so fixture signatures cover precisely the contract encoding.
  const digest = fixture.contract._persistentHash_0(statement);
  return { statement, signature: parsedSignature(ed25519.sign(digest, fixture.secretKey)) };
}

async function invoke(fixture, circuitId, ...args) {
  const context = runtime.createCircuitContext({
    circuitId,
    contractAddress: fixture.address,
    coinPublicKeyOrZswapState: runtime.sampleUserAddress(),
    contractState: fixture.state,
    privateState: undefined,
    time: Number(now),
  });
  const result = await fixture.contract.circuits[circuitId](context, ...args);
  fixture.state = result.context.callContext.currentQueryContext.state;
  return result;
}

test('valid credential authorizes once and a different registration remains eligible', async () => {
  const fixture = await setup();
  const valid = makeCredential(fixture);
  await invoke(fixture, 'authorizeRegistration', valid.statement, valid.signature);
  assert.equal(ledger(fixture.state).consumedNullifiers.size(), 1n);

  const second = makeCredential(fixture, {
    registrationCommitment: bytes(6),
    nonce: bytes(7),
    revocationHandle: bytes(8),
  });
  await invoke(fixture, 'authorizeRegistration', second.statement, second.signature);
  assert.equal(ledger(fixture.state).consumedNullifiers.size(), 2n);
});

test('bad signature, wrong issuer and missing publisher claim are rejected', async () => {
  for (const makeBad of [
    (f) => {
      const c = makeCredential(f);
      c.signature.s = (c.signature.s + 1n) % runtime.MAX_CURVE25519_SCALAR;
      return c;
    },
    (f) => makeCredential(f, { issuerId: bytes(9) }),
    (f) => makeCredential(f, { publisherAuthorized: false }),
    (f) => makeCredential(f, { organizationMember: false }),
    (f) => makeCredential(f, { individualVerified: false }),
  ]) {
    const fixture = await setup();
    const bad = makeBad(fixture);
    await assert.rejects(
      invoke(fixture, 'authorizeRegistration', bad.statement, bad.signature),
    );
    assert.equal(ledger(fixture.state).consumedNullifiers.size(), 0n);
  }
});

test('expired credential and replay are rejected without a second state change', async () => {
  const expiredFixture = await setup();
  const expired = makeCredential(expiredFixture, { expiresAt: now - 1n });
  await assert.rejects(
    invoke(expiredFixture, 'authorizeRegistration', expired.statement, expired.signature),
    /credential expired/,
  );

  const fixture = await setup();
  const valid = makeCredential(fixture);
  await invoke(fixture, 'authorizeRegistration', valid.statement, valid.signature);
  await assert.rejects(
    invoke(fixture, 'authorizeRegistration', valid.statement, valid.signature),
    /registration authorization replayed/,
  );
  assert.equal(ledger(fixture.state).consumedNullifiers.size(), 1n);
});

test('issuer suspension and signed credential revocation reject later authorization', async () => {
  const fixture = await setup();
  const update = {
    domain: pad('AudioTrust:issuer-update:v1'),
    contractContext: runtime.encodeContractAddress(fixture.address),
    nextIssuerId: fixture.issuerId,
    nextIssuerPublicKey: fixture.publicKey,
    nextActive: false,
    nextPolicyVersion: 1n,
    nonce: bytes(11),
  };
  const updateSig = parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_2(update), fixture.secretKey),
  );
  await invoke(fixture, 'updateIssuer', update, updateSig);
  const suspended = makeCredential(fixture);
  await assert.rejects(
    invoke(fixture, 'authorizeRegistration', suspended.statement, suspended.signature),
    /issuer suspended/,
  );

  const activeFixture = await setup();
  const revocation = {
    domain: pad('AudioTrust:revoke:v1'),
    contractContext: runtime.encodeContractAddress(activeFixture.address),
    issuerId: activeFixture.issuerId,
    revocationHandle: bytes(5),
    registrationCommitment: bytes(3),
    requestNonce: bytes(4),
    nonce: bytes(12),
  };
  const revocationSig = parsedSignature(
    ed25519.sign(activeFixture.contract._persistentHash_3(revocation), activeFixture.secretKey),
  );
  await invoke(activeFixture, 'revokeCredential', revocation, revocationSig);
  const revoked = makeCredential(activeFixture, {
    registrationCommitment: bytes(3),
    nonce: bytes(4),
  });
  await assert.rejects(
    invoke(activeFixture, 'authorizeRegistration', revoked.statement, revoked.signature),
    /credential revoked/,
  );
});

test('issuer key rotation invalidates old key and allows signed reinstatement with the new key', async () => {
  const fixture = await setup();
  const replacementSecret = new Uint8Array(32).fill(18);
  const replacementKey = point(ed25519.getPublicKey(replacementSecret));
  const update = {
    domain: pad('AudioTrust:issuer-update:v1'),
    contractContext: runtime.encodeContractAddress(fixture.address),
    nextIssuerId: fixture.issuerId,
    nextIssuerPublicKey: replacementKey,
    nextActive: true,
    nextPolicyVersion: 2n,
    nonce: bytes(21),
  };
  const oldKeySignature = parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_2(update), fixture.secretKey),
  );
  await invoke(fixture, 'updateIssuer', update, oldKeySignature);

  const oldKeyCredential = makeCredential(fixture, { policyVersion: 2n });
  await assert.rejects(
    invoke(fixture, 'authorizeRegistration', oldKeyCredential.statement, oldKeyCredential.signature),
    /invalid issuer signature/,
  );

  const newCredential = makeCredential(fixture, { policyVersion: 2n });
  newCredential.signature = parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_0(newCredential.statement), replacementSecret),
  );
  await invoke(fixture, 'authorizeRegistration', newCredential.statement, newCredential.signature);

  const suspend = {
    ...update,
    nextIssuerPublicKey: replacementKey,
    nextActive: false,
    nonce: bytes(22),
  };
  await invoke(fixture, 'updateIssuer', suspend, parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_2(suspend), replacementSecret),
  ));
  const reinstate = { ...suspend, nextActive: true, nonce: bytes(23) };
  await invoke(fixture, 'updateIssuer', reinstate, parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_2(reinstate), replacementSecret),
  ));
  const reinstatedCredential = makeCredential(fixture, {
    policyVersion: 2n,
    registrationCommitment: bytes(24),
    nonce: bytes(25),
  });
  reinstatedCredential.signature = parsedSignature(
    ed25519.sign(fixture.contract._persistentHash_0(reinstatedCredential.statement), replacementSecret),
  );
  await invoke(fixture, 'authorizeRegistration', reinstatedCredential.statement, reinstatedCredential.signature);
  assert.equal(ledger(fixture.state).consumedNullifiers.size(), 2n);
});

test('unauthorized issuer updates and malformed registration commitments fail', async () => {
  const fixture = await setup();
  const update = {
    domain: pad('AudioTrust:issuer-update:v1'),
    contractContext: runtime.encodeContractAddress(fixture.address),
    nextIssuerId: bytes(12),
    nextIssuerPublicKey: fixture.publicKey,
    nextActive: true,
    nextPolicyVersion: 2n,
    nonce: bytes(13),
  };
  const unauthorized = parsedSignature(ed25519.sign(fixture.contract._persistentHash_2(update), bytes(99)));
  await assert.rejects(invoke(fixture, 'updateIssuer', update, unauthorized), /unauthorized issuer update/);

  const malformed = makeCredential(fixture);
  malformed.statement.registrationCommitment = new Uint8Array(31);
  await assert.rejects(invoke(fixture, 'authorizeRegistration', malformed.statement, malformed.signature));
  assert.equal(ledger(fixture.state).consumedNullifiers.size(), 0n);
});

test('privacy schema contains only intended issuer and request-scoped revocation state', async () => {
  const fixture = await setup();
  const publicState = ledger(fixture.state);
  assert.deepEqual(Object.keys(publicState).sort(), [
    'consumedNullifiers',
    'issuerActive',
    'issuerId',
    'issuerPublicKey',
    'policyVersion',
    'revokedRequestReferences',
  ]);
});

test('privacy: the same private credential handle produces distinct public revocation references per request', async () => {
  const fixture = await setup();
  const first = makeCredential(fixture, { registrationCommitment: bytes(31), nonce: bytes(32) });
  const second = makeCredential(fixture, { registrationCommitment: bytes(33), nonce: bytes(34) });

  for (const [credential, adminNonce] of [[first, bytes(35)], [second, bytes(36)]]) {
    const statement = {
      domain: pad('AudioTrust:revoke:v1'),
      contractContext: runtime.encodeContractAddress(fixture.address),
      issuerId: fixture.issuerId,
      revocationHandle: credential.statement.revocationHandle,
      registrationCommitment: credential.statement.registrationCommitment,
      requestNonce: credential.statement.nonce,
      nonce: adminNonce,
    };
    const signature = parsedSignature(
      ed25519.sign(fixture.contract._persistentHash_3(statement), fixture.secretKey),
    );
    await invoke(fixture, 'revokeCredential', statement, signature);
  }

  const refs = [...ledger(fixture.state).revokedRequestReferences].map(([key]) => Buffer.from(key).toString('hex'));
  assert.equal(refs.length, 2);
  assert.equal(new Set(refs).size, 2, 'different registration requests must not share a public revocation reference');
  assert.ok(!refs.includes(Buffer.from(first.statement.revocationHandle).toString('hex')));
});
