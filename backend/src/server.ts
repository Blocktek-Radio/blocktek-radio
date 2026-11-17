import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { pool } from './db/pool.js';
import multipart from '@fastify/multipart';
import { registerAuthRoutes } from './auth-routes.js';
import { registerAudioRoutes } from './audio-routes.js';

const config = loadConfig();
const app = Fastify({ logger: { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] }, bodyLimit: config.MAX_UPLOAD_BYTES });

app.addHook('onRequest', async (request, reply) => {
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
