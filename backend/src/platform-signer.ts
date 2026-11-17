import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadConfig } from './config.js';

const config = loadConfig();

export async function signPlatformManifest(canonicalManifest: string) {
  const pem = await readFile(config.PLATFORM_KEY_PATH, 'utf8');
  const privateKey = createPrivateKey(pem);
  const publicKey = createPublicKey(privateKey);
  const signingBytes = Buffer.from(`AudioTrust:release-manifest:v1\n${canonicalManifest}`, 'utf8');
  const signature = sign(null, signingBytes, privateKey);
  const publicJwk = publicKey.export({ format: 'jwk' });
  if (!publicJwk.x) throw new Error('Could not export platform verification key.');
  return {
    keyId: config.PLATFORM_KEY_ID,
    algorithm: 'Ed25519',
    publicKey: publicJwk.x,
    signature: signature.toString('base64'),
  };
}
