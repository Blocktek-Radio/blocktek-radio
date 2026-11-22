import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { pool } from './db/pool.js';
import multipart from '@fastify/multipart';
import { registerAuthRoutes } from './auth-routes.js';
import { registerAudioRoutes } from './audio-routes.js';

const config = loadConfig();
const app = Fastify({ logger: { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] }, bodyLimit: config.MAX_UPLOAD_BYTES });

// A small in-process guard for the loopback MVP. It intentionally keys only
// on Fastify's socket IP (never an untrusted forwarded header). Deployments
// with multiple API workers should replace this with a shared limiter.
const windows = new Map<string, { count: number; expiresAt: number }>();
const routeLimits = new Map([
  ['/api/v1/auth/register', { max: 8, windowMs: 15 * 60_000 }],
  ['/api/v1/auth/login', { max: 12, windowMs: 15 * 60_000 }],
  ['/api/v1/audio', { max: 30, windowMs: 60_000 }],
]);
const cleanupRateWindows = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of windows) if (value.expiresAt <= now) windows.delete(key);
}, 60_000);
cleanupRateWindows.unref();

app.addHook('onRequest', async (request, reply) => {
  const route = request.url.split('?')[0];
  const policy = routeLimits.get(route) ?? (route.startsWith('/api/v1/audio/') ? routeLimits.get('/api/v1/audio') : undefined);
  if (policy && request.method !== 'OPTIONS') {
    const key = `${request.ip}:${route}`;
    const now = Date.now();
    let window = windows.get(key);
    if (!window || window.expiresAt <= now) {
      window = { count: 0, expiresAt: now + policy.windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    reply.header('x-ratelimit-limit', policy.max).header('x-ratelimit-remaining', Math.max(0, policy.max - window.count));
    if (window.count > policy.max) {
      reply.header('retry-after', Math.max(1, Math.ceil((window.expiresAt - now) / 1000)));
      return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests. Try again after the current rate window.' });
    }
  }
  const origin = request.headers.origin;
  if (origin && origin !== config.FRONTEND_ORIGIN) {
    return reply.code(403).send({ error: 'origin_denied', message: 'This application origin is not allowed.' });
  }
  if (origin === config.FRONTEND_ORIGIN) {
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-credentials', 'true');
    reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type, x-release-title, x-registration-id');
    reply.header('vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return reply.code(204).send();
});

await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 0 } });

app.get('/api/v1/health', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', checks: { database: 'ok' }, time: new Date().toISOString() };
  } catch {
    reply.code(503);
    return { status: 'degraded', checks: { database: 'unavailable' }, time: new Date().toISOString() };
  }
});

await registerAuthRoutes(app);
await registerAudioRoutes(app);

app.setErrorHandler((error, request, reply) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  request.log.error({ err: normalized }, 'Request failed');
  const candidate = typeof error === 'object' && error !== null && 'statusCode' in error
    ? error.statusCode
    : undefined;
  const status = typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
  reply.code(status).send({ error: status === 500 ? 'internal_error' : 'request_error', message: status === 500 ? 'The request could not be completed.' : normalized.message, requestId: request.id });
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
} finally {
  const shutdown = async () => { await app.close(); await pool.end(); };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
