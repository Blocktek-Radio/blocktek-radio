#!/usr/bin/env node
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyCreatorSignature } from '../packages/wallet-provider/src/index.js';

const usage = 'Usage: node scripts/verify-audiotrust-evidence.mjs <evidence.json> [audio-file]';

export async function verifyEvidence(evidence, audioPath) {
  if (!evidence || typeof evidence !== 'object' || typeof evidence.manifestCanonical !== 'string') {
    throw new Error('Evidence must contain manifestCanonical from the public evidence endpoint.');
  }
  const canonicalBytes = Buffer.from(evidence.manifestCanonical, 'utf8');
  const manifestDigest = createHash('sha256').update(canonicalBytes).digest('hex');
  const manifestValid = manifestDigest === evidence.manifestSha256;
  let manifest;
  try { manifest = JSON.parse(evidence.manifestCanonical); }
  catch { throw new Error('The canonical manifest is not valid JSON.'); }
  const canonicalFormValid = JSON.stringify(manifest) === evidence.manifestCanonical;

  const signatures = Array.isArray(evidence.signatures) ? evidence.signatures : [];
  const creator = signatures.find((signature) => signature.signerType === 'publisher_wallet');
  const platform = signatures.find((signature) => signature.signerType === 'audiotrust_platform');
  let creatorValid = false;
  if (creator?.signedPayload && creator?.signature && creator?.publicKey) {
    try {
      const intent = JSON.parse(creator.signedPayload);
      const expectedRegistration = typeof manifest.registrationId === 'string'
        ? createHash('sha256').update(`AudioTrustRegistration:v1\n${manifest.registrationId}`).digest('hex')
        : null;
      const signedAt = Date.parse(creator.verifiedAt);
      const linked = manifestValid && canonicalFormValid &&
        Number.isFinite(signedAt) &&
        intent.manifestCommitment === manifestDigest &&
        intent.registrationCommitment === expectedRegistration &&
        intent.creatorAccount === manifest.publisherKeyId &&
        intent.networkId === manifest.authorization?.network;
      const verified = verifyCreatorSignature(intent, {
        data: creator.signedPayload,
        signature: creator.signature,
        verifyingKey: creator.publicKey,
        scheme: creator.algorithm,
      }, {
        expectedAccount: creator.keyId,
        expectedNetwork: intent.networkId,
        // The signature proves a historical intent; check validity at its
        // server-verified signing time, not at the time an auditor reopens it.
        now: signedAt,
      });
      creatorValid = Boolean(verified && linked);
    } catch { creatorValid = false; }
  }

  let platformValid = false;
  if (platform?.publicKey && platform?.signature && manifestValid) {
    try {
      const rawKey = Buffer.from(platform.publicKey, 'base64');
      if (rawKey.length !== 32 || platform.algorithm !== 'Ed25519') throw new Error('Unsupported platform key.');
      const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawKey]), format: 'der', type: 'spki' });
      platformValid = verifySignature(null, Buffer.from(`AudioTrust:release-manifest:v1\n${evidence.manifestCanonical}`), key, Buffer.from(platform.signature, 'base64'));
    } catch { platformValid = false; }
  }

  let fileResult = 'NOT CHECKED';
  if (audioPath) {
    const audio = await readFile(audioPath);
    const actual = createHash('sha256').update(audio).digest('hex');
    fileResult = actual === manifest.audio?.sha256 ? 'MATCH' : 'MISMATCH';
  }

  const authorization = evidence.midnightAuthorization;
  const authorizationItems = Array.isArray(authorization) ? authorization
    : authorization && typeof authorization === 'object' ? [authorization] : [];
  const chainResult = authorizationItems.some((item) => item.status === 'revoked')
    ? 'REVOKED (current status must be checked with its issuer/network)'
    : authorizationItems.some((item) => item.status === 'authorized')
      ? 'REQUIRES NETWORK/INDEXER VERIFICATION'
      : authorizationItems.some((item) => ['pending', 'awaiting_finality', 'submitted'].includes(item.status))
        ? 'PENDING AUTHORIZATION'
        : 'UNAVAILABLE / NO MIDNIGHT EVIDENCE';
  return {
    manifestDigest: manifestValid && canonicalFormValid ? 'VALID' : 'INVALID',
    creatorSignature: creatorValid ? 'VALID (signing key verified; address binding not established)' : 'INVALID OR NOT PRESENT',
    platformSignature: platformValid ? 'VALID' : 'INVALID OR NOT PRESENT',
    fileIntegrity: fileResult,
    midnightEvidence: chainResult,
    limits: ['This verifier does not establish legal identity, copyright, speaker identity, content truth, or pre-registration authenticity.', 'A platform signature does not independently establish the trustworthiness of the platform key.', 'Midnight transaction finality and proof status require checking the referenced network/indexer.'],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length < 3 || process.argv.length > 4) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    try {
      const evidence = JSON.parse(await readFile(process.argv[2], 'utf8'));
      console.log(JSON.stringify(await verifyEvidence(evidence, process.argv[3]), null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
