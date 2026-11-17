import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';

const config = loadConfig();
if (config.PLATFORM_KEY_ID.includes('prod')) throw new Error('This command only creates an explicitly development-labeled platform key.');
const privatePath = path.resolve(config.PLATFORM_KEY_PATH);
const publicPath = `${privatePath}.pub.pem`;
await mkdir(path.dirname(privatePath), { recursive: true, mode: 0o700 });
await chmod(path.dirname(privatePath), 0o700);
const pair = generateKeyPairSync('ed25519');
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
await writeFile(privatePath, privatePem, { flag: 'wx', mode: 0o600 });
await writeFile(publicPath, publicPem, { flag: 'wx', mode: 0o644 });
console.info(JSON.stringify({ status: 'development_key_created', keyId: config.PLATFORM_KEY_ID, publicKeyPath: publicPath }));
