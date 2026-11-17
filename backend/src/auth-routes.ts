import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, createSession, getSessionUser, hashPassword, hashToken, readSessionCookie, setSessionCookie, verifyPassword } from './auth.js';
import { pool } from './db/pool.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(256),
});

const registrationSchema = credentialsSchema.extend({
  organizationName: z.string().trim().min(2).max(120),
  publisherName: z.string().trim().min(2).max(120),
});

function badRequest(message: string, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('Provide a valid email, a password of at least 12 characters, and publisher names.');
    const input = parsed.data;
    const passwordHash = await hashPassword(input.password);
    const client = await pool.connect();
    let userId = '';
    let publisherId = '';
    const token = randomBytes(32).toString('base64url');
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [input.email, passwordHash],
      );
      userId = user.rows[0].id;
      const organization = await client.query<{ id: string }>(
        'INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING id',
        [input.organizationName, userId],
      );
      await client.query(
        'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [organization.rows[0].id, userId, 'owner'],
      );
      const publisher = await client.query<{ id: string }>(
        'INSERT INTO publishers (organization_id, display_name) VALUES ($1, $2) RETURNING id',
        [organization.rows[0].id, input.publisherName],
      );
      publisherId = publisher.rows[0].id;
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, organization_id, action, subject_type, subject_id, details)
         VALUES ($1, $2, 'account.publisher.created', 'publisher', $3, $4::jsonb)`,
        [userId, organization.rows[0].id, publisherId, JSON.stringify({ assuranceLevel: 'blocktek-issued-unverified-legal-identity' })],
      );
      await client.query(
        'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(token), userId, new Date(Date.now() + 8 * 60 * 60 * 1000)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw badRequest('An account with this email already exists.', 409);
      }
      throw error;
    } finally {
      client.release();
    }
    reply.header('set-cookie', setSessionCookie(token)).code(201);
    return {
      user: { id: userId, email: input.email, emailVerified: false },
      publisher: { id: publisherId, name: input.publisherName, status: 'draft', assuranceLevel: 'blocktek-issued-unverified-legal-identity' },
      emailVerification: { status: 'not_configured', message: 'Email delivery is not configured; this account is not email-verified.' },
    };
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('Email or password is incorrect.', 401);
    const result = await pool.query<{ id: string; email: string; password_hash: string | null }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1', [parsed.data.email],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
      throw badRequest('Email or password is incorrect.', 401);
    }
    const token = await createSession(user.id);
    reply.header('set-cookie', setSessionCookie(token));
    return { user: { id: user.id, email: user.email, emailVerified: false } };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const token = readSessionCookie(request);
    if (token) await pool.query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
    reply.header('set-cookie', clearSessionCookie());
    return { status: 'signed_out' };
  });

  app.get('/api/v1/auth/me', async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'unauthenticated', message: 'Sign in to continue.' });
    const publishers = await pool.query(
      `SELECT p.id, p.display_name AS name, p.status, p.assurance_level AS "assuranceLevel", m.role
       FROM organization_members m JOIN publishers p ON p.organization_id = m.organization_id
       WHERE m.user_id = $1 ORDER BY p.created_at`, [user.id],
    );
    return { user: { ...user, emailVerified: false }, publishers: publishers.rows };
  });

  app.get('/api/v1/publishers/:publisherId/releases', async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ error: 'unauthenticated', message: 'Sign in to continue.' });
    const params = z.object({ publisherId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) throw badRequest('Publisher identifier is invalid.');
    const access = await pool.query(
      `SELECT 1 FROM publishers p JOIN organization_members m ON m.organization_id = p.organization_id
       WHERE p.id = $1 AND m.user_id = $2`, [params.data.publisherId, user.id],
    );
    if (!access.rowCount) return reply.code(404).send({ error: 'not_found', message: 'Publisher was not found.' });
    const releases = await pool.query(
      `SELECT r.id, r.status, a.title, f.sha256, f.byte_size AS "byteSize", f.media_type AS "mediaType", r.created_at AS "createdAt"
       FROM registration_requests r JOIN audio_assets a ON a.publisher_id = r.publisher_id
       JOIN audio_files f ON f.asset_id = a.id
       WHERE r.publisher_id = $1 ORDER BY r.created_at DESC`, [params.data.publisherId],
    );
    return { releases: releases.rows };
  });
}
