import { createHash, randomBytes } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canonicalizeIntent, createIntent, verifyCreatorSignature } from '../../packages/wallet-provider/src/index.js';
import type { CreatorIntent } from '../../packages/wallet-provider/src/index.js';
import { getSessionUser } from './auth.js';
import { loadConfig } from './config.js';
import { pool } from './db/pool.js';
import { signPlatformManifest } from './platform-signer.js';
import { LocalFilesystemStorage } from './storage/local-filesystem.js';

const config = loadConfig();
const storage = new LocalFilesystemStorage(config.STORAGE_ROOT);
const uuid = z.string().uuid();

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function isAudioSignature(buffer: Buffer, mediaType: string) {
  if (mediaType === 'audio/wav' || mediaType === 'audio/x-wav') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
  if (mediaType === 'audio/ogg') return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  if (mediaType === 'audio/flac') return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC';
  if (mediaType === 'audio/mpeg') return buffer.length >= 3 && (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
  if (mediaType === 'audio/mp4') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  if (mediaType === 'audio/webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mediaType === 'audio/aac') return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  return false;
}

const audioTypes = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/webm', 'audio/aac']);

function accessQuery() {
  return `SELECT p.id, p.display_name, p.status, p.assurance_level, m.role
    FROM publishers p JOIN organization_members m ON m.organization_id = p.organization_id
    WHERE p.id = $1 AND m.user_id = $2`;
}

async function getRegistrationAccess(registrationId: string, userId: string) {
  return pool.query(
    `SELECT r.id, r.publisher_id, r.status, r.wallet_id, r.created_at, p.display_name, p.assurance_level,
            f.sha256, f.byte_size, f.media_type, a.title, m.role, mf.id AS manifest_id, mf.canonical_json, mf.sha256 AS manifest_sha256
     FROM registration_requests r JOIN publishers p ON p.id = r.publisher_id
     JOIN organization_members m ON m.organization_id = p.organization_id AND m.user_id = $2
     JOIN audio_assets a ON a.publisher_id = p.id
     JOIN audio_files f ON f.asset_id = a.id
     LEFT JOIN release_manifests mf ON mf.registration_id = r.id
     WHERE r.id = $1 AND r.publisher_id = p.id AND r.id = a.id`, [registrationId, userId],
  );
}

function makeManifest(row: { id: string; publisher_id: string; display_name: string; assurance_level: string; sha256: string; byte_size: string | number; media_type: string; title: string; created_at: Date }, walletAddress: string) {
  const manifest = {
    protocol: 'audiotrust.release',
    version: 1,
    registrationId: row.id,
    publisherId: row.publisher_id,
    publisherName: row.display_name,
    publisherAssurance: row.assurance_level,
    publisherKeyId: walletAddress,
    audioTrustReference: row.id,
    title: row.title,
    audio: { sha256: row.sha256, mediaType: row.media_type, size: Number(row.byte_size) },
    registeredAt: new Date(row.created_at).toISOString(),
    signingProfile: 'midnight-dapp-connector-signData-v1',
    authorization: { network: config.MIDNIGHT_NETWORK, policyVersion: 1, status: 'awaiting_midnight' },
  };
  const canonical = JSON.stringify(manifest);
  return { manifest, canonical, digest: sha256(canonical) };
}

export async function registerAudioRoutes(app: FastifyInstance) {
  app.post('/api/v1/publishers/:publisherId/releases', async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'unauthenticated', message: 'Sign in to continue.' });
    const params = z.object({ publisherId: uuid }).safeParse(request.params);
    if (!params.success) throw httpError('Publisher identifier is invalid.', 400);
    const title = z.string().trim().min(1).max(180).safeParse(request.headers['x-release-title']);
    if (!title.success) throw httpError('Provide a release title in the x-release-title header.', 400);
    const access = await pool.query(accessQuery(), [params.data.publisherId, user.id]);
    if (!access.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Publisher was not found.' });
    if (access.rows[0].role === 'viewer' || access.rows[0].status === 'suspended') {
      return reply.code(403).send({ error: 'publisher_not_authorized', message: 'This publisher role cannot create releases.' });
    }
    const file = await request.file();
    if (!file) throw httpError('Choose one supported audio file.', 400);
    const mediaType = file.mimetype.toLowerCase();
    if (!audioTypes.has(mediaType)) {
      file.file.resume();
      throw httpError('Supported audio types: MP3, WAV, Ogg, FLAC, MP4 audio, WebM audio, and AAC.', 415);
    }
    let prefix = Buffer.alloc(0);
    const sniff = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.subarray(0, 16 - prefix.length)]);
        callback(null, chunk);
      },
      flush(callback) {
        if (!isAudioSignature(prefix, mediaType)) return callback(httpError('The file content does not match its declared audio type.', 415));
        callback();
      },
    });
    const checked = new Transform({ transform(chunk, _encoding, callback) { callback(null, chunk); } });
    const ingest = pipeline(file.file, sniff, checked);
    let stored: Awaited<ReturnType<typeof storage.save>>;
    try {
      stored = await storage.save(checked, mediaType, config.MAX_UPLOAD_BYTES);
      await ingest;
    } catch (error) {
      await ingest.catch(() => {});
      throw error;
    }
    if (file.file.truncated) {
      await storage.delete(stored.key);
      throw httpError('The audio file exceeds the configured upload limit.', 413);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const asset = await client.query<{ id: string }>(
        'INSERT INTO audio_assets (publisher_id, title) VALUES ($1, $2) RETURNING id',
        [params.data.publisherId, title.data],
      );
      await client.query(
        'INSERT INTO audio_files (asset_id, object_key, sha256, byte_size, media_type) VALUES ($1, $2, $3, $4, $5)',
        [asset.rows[0].id, stored.key, stored.sha256, stored.size, mediaType],
      );
      const registration = await client.query<{ id: string }>(
        'INSERT INTO registration_requests (id, publisher_id, status) VALUES ($1, $2, $3) RETURNING id',
        [asset.rows[0].id, params.data.publisherId, 'awaiting_signature'],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, subject_type, subject_id, details)
         VALUES ($1, 'audio.uploaded', 'registration', $2, $3::jsonb)`,
        [user.id, registration.rows[0].id, JSON.stringify({ sha256: stored.sha256, size: stored.size, mediaType })],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ registrationId: registration.rows[0].id, status: 'awaiting_signature', audio: { sha256: stored.sha256, size: stored.size, mediaType } });
    } catch (error) {
      await client.query('ROLLBACK');
      await storage.delete(stored.key);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/v1/audio/:registrationId/intent', async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'unauthenticated', message: 'Sign in to continue.' });
    const params = z.object({ registrationId: uuid }).safeParse(request.params);
    const body = z.object({ walletAddress: z.string().min(8).max(256) }).safeParse(request.body);
    if (!params.success || !body.success) throw httpError('Registration identifier or wallet address is invalid.', 400);
    const result = await getRegistrationAccess(params.data.registrationId, user.id);
    const row = result.rows[0] as (typeof result.rows[number] & { id: string; publisher_id: string; display_name: string; assurance_level: string; sha256: string; byte_size: string | number; media_type: string; title: string; created_at: Date; role: string; status: string; canonical_json: string | null; manifest_sha256: string | null }) | undefined;
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Registration was not found.' });
    if (row.role === 'viewer' || row.status !== 'awaiting_signature') throw httpError('This release is not ready for a wallet signature.', 409);
    const { manifest, canonical, digest } = makeManifest(row, body.data.walletAddress);
    const manifestResult = await pool.query(
      `INSERT INTO release_manifests (registration_id, protocol, canonical_json, sha256)
       VALUES ($1, 'audiotrust.release/v1', $2, $3)
       ON CONFLICT (registration_id) DO NOTHING
       RETURNING id`, [row.id, canonical, digest],
    );
    if (!manifestResult.rowCount) {
      const existing = await pool.query<{ canonical_json: string; sha256: string }>(
        'SELECT canonical_json, sha256 FROM release_manifests WHERE registration_id = $1', [row.id],
      );
      if (existing.rows[0]?.canonical_json !== canonical || existing.rows[0]?.sha256 !== digest) {
        throw httpError('A signing intent already exists with different manifest fields; create a new release request.', 409);
      }
    }
    const now = Date.now();
    const nonce = randomBytes(32).toString('hex');
    const intent = createIntent({
      networkId: config.MIDNIGHT_NETWORK,
      creatorAccount: body.data.walletAddress,
      registrationCommitment: sha256(`AudioTrustRegistration:v1\n${row.id}`),
      manifestCommitment: digest,
      nonce,
      now,
      ttlMs: 5 * 60_000,
    });
    await pool.query(
      `INSERT INTO consumed_nonces (nonce_hash, user_id, network, purpose, expires_at)
       VALUES ($1, $2, $3, 'release_signature', $4)`,
      [sha256(nonce), user.id, config.MIDNIGHT_NETWORK, new Date(intent.expiresAt)],
    );
    return { manifest, manifestSha256: digest, intent };
  });

  app.post('/api/v1/audio/:registrationId/signature', async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'unauthenticated', message: 'Sign in to continue.' });
    const params = z.object({ registrationId: uuid }).safeParse(request.params);
    const signatureSchema = z.object({
      data: z.string().max(2000),
      signature: z.string().regex(/^(?:[a-f0-9]{2})+$/i),
      verifyingKey: z.string().regex(/^(?:[a-f0-9]{2})+$/i),
      scheme: z.enum(['schnorr_bip340', 'ecdsa_secp256k1_sha256']).optional(),
    });
    const body = z.object({ intent: z.record(z.string(), z.unknown()), signature: signatureSchema }).safeParse(request.body);
    if (!params.success || !body.success) throw httpError('Registration signature request is invalid.', 400);
    const result = await getRegistrationAccess(params.data.registrationId, user.id);
    const row = result.rows[0] as (typeof result.rows[number] & { id: string; publisher_id: string; status: string; role: string; canonical_json: string | null; manifest_sha256: string | null }) | undefined;
    if (!row || !row.canonical_json || !row.manifest_sha256) return reply.code(404).send({ error: 'not_found', message: 'Signing request was not found.' });
    if (row.role === 'viewer' || row.status !== 'awaiting_signature') throw httpError('This release is not awaiting a signature.', 409);
    const intentSchema = z.object({
      protocol: z.literal('audiotrust.creator-registration'), version: z.literal(1), networkId: z.string(), creatorAccount: z.string(),
      registrationCommitment: z.string(), manifestCommitment: z.string(), nonce: z.string(),
      createdAt: z.number().int(), expiresAt: z.number().int(), purpose: z.literal('approve_registration'),
    });
    const intent = intentSchema.safeParse(body.data.intent);
    if (!intent.success) throw httpError('The signing intent fields are invalid.', 400);
    const nonceDigest = sha256(intent.data.nonce);
    const nonceRow = await pool.query(
      `SELECT 1 FROM consumed_nonces WHERE nonce_hash = $1 AND user_id = $2 AND network = $3
       AND purpose = 'release_signature' AND consumed_at IS NULL AND expires_at > now()`,
      [nonceDigest, user.id, config.MIDNIGHT_NETWORK],
    );
    if (!nonceRow.rowCount) throw httpError('The signing nonce is unknown, expired, or already used.', 409);
    const expectedRegistrationCommitment = sha256(`AudioTrustRegistration:v1\n${row.id}`);
    if (intent.data.registrationCommitment !== expectedRegistrationCommitment || intent.data.manifestCommitment !== row.manifest_sha256 || intent.data.networkId !== config.MIDNIGHT_NETWORK) {
      throw httpError('The signed request does not match this release or network.', 400);
    }
    let verified: ReturnType<typeof verifyCreatorSignature>;
    try {
      verified = verifyCreatorSignature(intent.data as unknown as CreatorIntent, body.data.signature as Parameters<typeof verifyCreatorSignature>[1], {
        expectedNetwork: config.MIDNIGHT_NETWORK,
        expectedAccount: intent.data.creatorAccount,
      });
    } catch (error) {
      throw httpError(error instanceof Error ? error.message : 'Wallet signature verification failed.', 400);
    }
    const platform = await signPlatformManifest(row.canonical_json);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{ status: string }>('SELECT status FROM registration_requests WHERE id = $1 FOR UPDATE', [row.id]);
      if (locked.rows[0]?.status !== 'awaiting_signature') throw httpError('This release was already signed or changed state.', 409);
      const consumed = await client.query(
        `UPDATE consumed_nonces SET consumed_at = now() WHERE nonce_hash = $1 AND user_id = $2
         AND purpose = 'release_signature' AND consumed_at IS NULL AND expires_at > now() RETURNING nonce_hash`,
        [nonceDigest, user.id],
      );
      if (!consumed.rowCount) throw httpError('This signing nonce has already been consumed.', 409);
      const existingWallet = await client.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM wallets WHERE network = $1 AND address = $2 FOR UPDATE',
        [intent.data.networkId, intent.data.creatorAccount],
      );
      let walletId: string;
      if (existingWallet.rowCount) {
        if (existingWallet.rows[0].user_id !== user.id) throw httpError('This wallet address is already associated with another account.', 409);
        walletId = existingWallet.rows[0].id;
      } else {
        const wallet = await client.query<{ id: string }>(
          `INSERT INTO wallets (user_id, address, network, verified_at, binding_status)
           VALUES ($1, $2, $3, NULL, 'signature-key-not-address-bound') RETURNING id`,
          [user.id, intent.data.creatorAccount, intent.data.networkId],
        );
        walletId = wallet.rows[0].id;
      }
      await client.query('UPDATE registration_requests SET wallet_id = $1, status = $2, updated_at = now() WHERE id = $3', [walletId, 'awaiting_midnight', row.id]);
      await client.query(
        `INSERT INTO release_signatures (manifest_id, signer_type, algorithm, key_id, public_key, signature, signed_payload, verified_at)
         SELECT id, 'publisher_wallet', $2, $3, $4, $5, $6, now() FROM release_manifests WHERE registration_id = $1`,
        [row.id, verified.scheme, intent.data.creatorAccount, verified.signerKey, body.data.signature.signature, canonicalizeIntent(intent.data as unknown as CreatorIntent)],
      );
      await client.query(
        `INSERT INTO release_signatures (manifest_id, signer_type, algorithm, key_id, public_key, signature, verified_at)
         SELECT id, 'audiotrust_platform', $2, $3, $4, $5, now() FROM release_manifests WHERE registration_id = $1`,
        [row.id, platform.algorithm, platform.keyId, platform.publicKey, platform.signature],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, subject_type, subject_id, details)
         VALUES ($1, 'audio.release.signed', 'registration', $2, $3::jsonb)`,
        [user.id, row.id, JSON.stringify({ creatorSignature: verified.scheme, platformKeyId: platform.keyId, midnightStatus: 'awaiting_midnight' })],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      registrationId: row.id,
      status: 'awaiting_midnight',
      publisherSignature: { verified: true, algorithm: verified.scheme, keyToAddressBinding: 'unverified' },
      platformSignature: { verified: true, algorithm: platform.algorithm, keyId: platform.keyId },
      midnightAuthorization: { status: 'pending', transactionId: null, message: 'No Midnight transaction has been submitted for this release.' },
    };
  });

  const evidenceHandler = async (registrationId: string, reply: { code: (code: number) => { send: (body: unknown) => unknown } }) => {
    const validId = uuid.safeParse(registrationId);
    if (!validId.success) throw httpError('Registration identifier is invalid.', 400);
    const registration = await pool.query(
      `SELECT r.id, r.status, r.created_at, p.id AS publisher_id, p.display_name AS publisher_name,
              p.assurance_level, a.title, f.sha256 AS audio_sha256, f.byte_size, f.media_type,
              m.canonical_json, m.sha256 AS manifest_sha256
       FROM registration_requests r JOIN publishers p ON p.id = r.publisher_id
       JOIN audio_assets a ON a.id = r.id JOIN audio_files f ON f.asset_id = a.id
       LEFT JOIN release_manifests m ON m.registration_id = r.id WHERE r.id = $1`, [registrationId],
    );
    if (!registration.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Release evidence was not found.' });
    const row = registration.rows[0];
    const signatures = await pool.query(
      `SELECT signer_type AS "signerType", algorithm, key_id AS "keyId", public_key AS "publicKey", signature,
              signed_payload AS "signedPayload", verified_at AS "verifiedAt"
       FROM release_signatures WHERE manifest_id = (SELECT id FROM release_manifests WHERE registration_id = $1)
       ORDER BY signer_type`, [registrationId],
    );
    const authorizations = await pool.query(
      `SELECT provider, status, network, transaction_id AS "transactionId", evidence, created_at AS "createdAt"
       FROM authorization_records WHERE registration_id = $1 ORDER BY created_at`, [registrationId],
    );
    const verificationHistory = await pool.query(
      `SELECT result, created_at AS "createdAt"
       FROM verification_events WHERE manifest_id = (SELECT id FROM release_manifests WHERE registration_id = $1)
       ORDER BY created_at DESC LIMIT 50`, [registrationId],
    );
    return {
      registration: { id: row.id, status: row.status, createdAt: row.created_at },
      publisher: { id: row.publisher_id, name: row.publisher_name, assuranceLevel: row.assurance_level },
      audio: { title: row.title, sha256: row.audio_sha256, size: Number(row.byte_size), mediaType: row.media_type },
      manifest: row.canonical_json ? JSON.parse(row.canonical_json) : null,
      manifestCanonical: row.canonical_json,
      manifestSha256: row.manifest_sha256,
      signatures: signatures.rows,
      midnightAuthorization: authorizations.rows.length ? authorizations.rows : { status: 'pending', transactions: [] },
      verificationHistory: verificationHistory.rows,
      limitations: [
        'A matching SHA-256 establishes exact byte equality only; it does not establish truth, speaker identity, copyright ownership, or pre-registration integrity.',
        'The wallet signature public key is verified, but this integration does not prove that the key derives the displayed Midnight address.',
        'No Midnight authorization transaction has been submitted for this release.',
        'Publisher assurance is BlockTek-issued and is not a claim of independently verified legal identity.',
      ],
    };
  };

  app.get('/api/v1/audio/:registrationId', async (request, reply) => {
    const params = z.object({ registrationId: uuid }).safeParse(request.params);
    if (!params.success) throw httpError('Registration identifier is invalid.', 400);
    return evidenceHandler(params.data.registrationId, reply);
  });
  app.get('/api/v1/audio/:registrationId/evidence', async (request, reply) => {
    const params = z.object({ registrationId: uuid }).safeParse(request.params);
    if (!params.success) throw httpError('Registration identifier is invalid.', 400);
    return evidenceHandler(params.data.registrationId, reply);
  });

  app.post('/api/v1/audio/:registrationId/verify-file', async (request, reply) => {
    const params = z.object({ registrationId: uuid }).safeParse(request.params);
    if (!params.success) throw httpError('Registration identifier is invalid.', 400);
    const registration = await pool.query<{ id: string; sha256: string; manifest_id: string | null }>(
      `SELECT r.id, f.sha256, m.id AS manifest_id FROM registration_requests r
       JOIN audio_assets a ON a.id = r.id JOIN audio_files f ON f.asset_id = a.id
       LEFT JOIN release_manifests m ON m.registration_id = r.id WHERE r.id = $1`, [params.data.registrationId],
    );
    if (!registration.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Release evidence was not found.' });
    const file = await request.file();
    if (!file) throw httpError('Choose the audio file to compare.', 400);
    const digest = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) { size += chunk.length; digest.update(chunk); callback(null, chunk); },
    });
    await pipeline(file.file, meter, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
    if (file.file.truncated || size > config.MAX_UPLOAD_BYTES) throw httpError('The audio file exceeds the configured upload limit.', 413);
    const observed = digest.digest('hex');
    const result = observed === registration.rows[0].sha256 ? 'match' : 'mismatch';
    await pool.query(
      'INSERT INTO verification_events (manifest_id, result, observed_sha256) VALUES ($1, $2, $3)',
      [registration.rows[0].manifest_id, result, observed],
    );
    return { registrationId: registration.rows[0].id, result: result.toUpperCase(), expectedSha256: registration.rows[0].sha256, observedSha256: observed, byteSize: size };
  });
}
