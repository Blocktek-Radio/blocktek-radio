import { z } from 'zod';

const schema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  DATABASE_URL: z.string().min(1),
  STORAGE_ROOT: z.string().default('./var/private-audio'),
  PLATFORM_KEY_PATH: z.string().default('./var/keys/platform-dev-private.pem'),
  PLATFORM_KEY_ID: z.string().default('audiotrust-platform-dev-v1'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  MIDNIGHT_NETWORK: z.string().default('undeployed'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
