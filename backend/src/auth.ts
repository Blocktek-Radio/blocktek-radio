import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import { pool } from './db/pool.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'audiotrust_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type AuthenticatedUser = { id: string; email: string };

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [algorithm, saltHex, keyHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(saltHex ?? '') || !/^[a-f0-9]{128}$/.test(keyHex ?? '')) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return timingSafeEqual(actual, expected);
}

export function readSessionCookie(request: FastifyRequest) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const item = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return item?.slice(SESSION_COOKIE.length + 1);
}

function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function setSessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; ${cookieOptions()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS)],
  );
  return token;
}

export async function getSessionUser(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = readSessionCookie(request);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const result = await pool.query<AuthenticatedUser>(
    `SELECT u.id, u.email FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function requireUser(request: FastifyRequest) {
  return getSessionUser(request);
}
