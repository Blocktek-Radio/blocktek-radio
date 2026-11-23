import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { DevelopmentMockProvider } from '../packages/wallet-provider/src/dev-mock.js';
import { createIntent } from '../packages/wallet-provider/src/index.js';
import { verifyEvidence } from './verify-audiotrust-evidence.mjs';

test('portable verifier validates a canonical manifest and distinct signatures', async () => {
  const contentHash = createHash('sha256').update('audio bytes').digest('hex');
  const wallet = new DevelopmentMockProvider();
  await wallet.connect();
  const registrationId = '5b1f9f4e-ec19-48d1-bd27-3bc3e5ef0b19';
  const manifest = { protocol: 'audiotrust.release', version: 1, registrationId,
    publisherKeyId: wallet.account, audio: { sha256: contentHash }, authorization: { network: 'undeployed' } };
  const manifestCanonical = JSON.stringify(manifest);
  const manifestSha256 = createHash('sha256').update(manifestCanonical).digest('hex');
  const intent = createIntent({ networkId: 'undeployed', creatorAccount: wallet.account,
    registrationCommitment: createHash('sha256').update(`AudioTrustRegistration:v1\n${registrationId}`).digest('hex'), manifestCommitment: manifestSha256,
    nonce: '22'.repeat(32), now: Date.now(), ttlMs: 60_000 });
  const creatorSignature = await wallet.signMessage(JSON.stringify(intent));
  const platformKeys = generateKeyPairSync('ed25519');
  const platformPublicJwk = platformKeys.publicKey.export({ format: 'jwk' });
  const platformSignature = sign(null, Buffer.from(`AudioTrust:release-manifest:v1\n${manifestCanonical}`), platformKeys.privateKey);
  const evidence = {
    manifestCanonical, manifestSha256,
    signatures: [
      { signerType: 'publisher_wallet', algorithm: creatorSignature.scheme, keyId: intent.creatorAccount,
        publicKey: creatorSignature.verifyingKey, signature: creatorSignature.signature, signedPayload: creatorSignature.data,
        verifiedAt: new Date().toISOString() },
      { signerType: 'audiotrust_platform', algorithm: 'Ed25519', keyId: 'dev-key',
        publicKey: Buffer.from(platformPublicJwk.x, 'base64url').toString('base64'), signature: platformSignature.toString('base64') },
    ],
    midnightAuthorization: { status: 'pending', transactions: [] },
  };
  const result = await verifyEvidence(evidence);
  assert.equal(result.manifestDigest, 'VALID');
  assert.match(result.creatorSignature, /^VALID/);
  assert.equal(result.platformSignature, 'VALID');
  assert.equal(result.midnightEvidence, 'PENDING AUTHORIZATION');

  const modified = structuredClone(evidence);
  modified.manifestCanonical = `${manifestCanonical} `;
  assert.equal((await verifyEvidence(modified)).manifestDigest, 'INVALID');

  const mismatchedIntent = createIntent({ ...intent, manifestCommitment: '33'.repeat(32), nonce: '44'.repeat(32) });
  const mismatchedSignature = await wallet.signMessage(JSON.stringify(mismatchedIntent));
  const unbound = structuredClone(evidence);
  unbound.signatures[0].signedPayload = mismatchedSignature.data;
  unbound.signatures[0].signature = mismatchedSignature.signature;
  assert.equal((await verifyEvidence(unbound)).creatorSignature, 'INVALID OR NOT PRESENT');
});
