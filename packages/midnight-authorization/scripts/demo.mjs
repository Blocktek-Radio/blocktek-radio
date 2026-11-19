import { ed25519 } from '@noble/curves/ed25519.js';
import * as runtime from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../artifacts/contract/contract/index.js';

const text = new TextEncoder();
const now = BigInt(Math.floor(Date.now() / 1000));
const blockTekIssuerId = new Uint8Array(32).fill(1);
const issuerSecret = new Uint8Array(32).fill(7);
const issuerPublic = ed25519.ExtendedPoint.fromBytes(ed25519.getPublicKey(issuerSecret)).toAffine();
const pad32 = (value) => {
  const out = new Uint8Array(32);
  out.set(text.encode(value));
  return out;
};
const point = (bytes) => ed25519.ExtendedPoint.fromBytes(bytes).toAffine();
const scalar = (bytes) => BigInt(`0x${Buffer.from(bytes).reverse().toString('hex')}`);
const parseSignature = (signature) => ({ r: point(signature.slice(0, 32)), s: scalar(signature.slice(32)) });

const contract = new Contract({});
const address = runtime.sampleContractAddress();
const constructor = await contract.initialState(
  runtime.createConstructorContext(undefined, runtime.sampleUserAddress()),
  blockTekIssuerId,
  issuerPublic,
);
let publicState = constructor.currentContractState.data;

async function call(circuitId, ...args) {
  const context = runtime.createCircuitContext({
    circuitId,
    contractAddress: address,
    coinPublicKeyOrZswapState: runtime.sampleUserAddress(),
    contractState: publicState,
    privateState: undefined,
    time: Number(now),
  });
  const result = await contract.circuits[circuitId](context, ...args);
  publicState = result.context.callContext.currentQueryContext.state;
}

function credential(overrides = {}) {
  const statement = {
    domain: pad32('AudioTrust:credential:v1'),
    contractContext: runtime.encodeContractAddress(address),
    issuerId: blockTekIssuerId,
    schemaVersion: 1n,
    subjectCommitment: new Uint8Array(32).fill(2),
    individualVerified: true,
    organizationMember: true,
    publisherAuthorized: true,
    issuedAt: now - 60n,
    expiresAt: now + 840n,
    registrationCommitment: new Uint8Array(32).fill(3),
    policyVersion: 1n,
    nonce: new Uint8Array(32).fill(4),
    revocationHandle: new Uint8Array(32).fill(5),
    ...overrides,
  };
  const digest = contract._persistentHash_0(statement);
  return { statement, signature: parseSignature(ed25519.sign(digest, issuerSecret)) };
}

async function expectReject(label, operation) {
  try {
    await operation();
    console.log(`UNEXPECTED SUCCESS: ${label}`);
  } catch (error) {
    console.log(`Rejected ${label}: ${error.message}`);
  }
}

console.log('AudioTrustPublisherAuthorization — compiled Compact runtime simulation');
console.log('BlockTek issuer initialized:', ledger(publicState).issuerActive);
console.log('No transaction is submitted; this demo runs compiled circuit code locally.');

const valid = credential();
await call('authorizeRegistration', valid.statement, valid.signature);
console.log('Valid publisher authorization: accepted');

const invalid = credential({ registrationCommitment: new Uint8Array(32).fill(6) });
invalid.signature.s = (invalid.signature.s + 1n) % runtime.MAX_CURVE25519_SCALAR;
await expectReject('invalid issuer signature', () => call('authorizeRegistration', invalid.statement, invalid.signature));

const expired = credential({ expiresAt: now - 1n, registrationCommitment: new Uint8Array(32).fill(7) });
await expectReject('expired credential', () => call('authorizeRegistration', expired.statement, expired.signature));
const staleLease = credential({ expiresAt: now + 841n, registrationCommitment: new Uint8Array(32).fill(8) });
await expectReject('status attestation over fifteen minutes old', () => call('authorizeRegistration', staleLease.statement, staleLease.signature));

await expectReject('same-request replay', () => call('authorizeRegistration', valid.statement, valid.signature));

console.log('Observed local state:', {
  consumedRequestNullifiers: ledger(publicState).consumedNullifiers.size().toString(),
  consumedIssuerUpdateNonces: ledger(publicState).consumedIssuerUpdateNonces.size().toString(),
});
