import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageProvider, StoredObject } from './provider.js';

export class LocalFilesystemStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }

  async save(source: Readable, contentType: string, maxBytes: number): Promise<StoredObject> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
    const key = randomUUID();
    const destination = this.resolve(key);
    const temporary = `${destination}.partial`;
    const hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > maxBytes) return callback(new Error('Upload exceeds configured size limit'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      await rename(temporary, destination);
      return { key, size, sha256: hash.digest('hex'), contentType };
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  retrieve(key: string) { return createReadStream(this.resolve(key)); }
  async delete(key: string) { await rm(this.resolve(key), { force: true }); }
  async exists(key: string) {
    try { await stat(this.resolve(key)); return true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  async metadata(key: string) {
    try {
      const info = await stat(this.resolve(key));
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(this.resolve(key))) digest.update(chunk as Buffer);
      return { key, size: info.size, sha256: digest.digest('hex') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async verify(key: string, expectedSha256: string) {
    const object = await this.metadata(key);
    return object !== null && object.sha256 === expectedSha256;
  }
}
