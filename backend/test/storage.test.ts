import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LocalFilesystemStorage } from '../src/storage/local-filesystem.js';

test('private filesystem storage saves exact bytes, reports metadata and verifies integrity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'audiotrust-storage-'));
  const storage = new LocalFilesystemStorage(root);
  const bytes = Buffer.from('audio fixture bytes');
  try {
    const saved = await storage.save(Readable.from([bytes]), 'audio/wav', 1024);
    assert.equal(saved.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(saved.size, bytes.length);
    assert.equal(await storage.exists(saved.key), true);
    assert.deepEqual(await storage.metadata(saved.key), {
      key: saved.key,
      size: bytes.length,
      sha256: saved.sha256,
    });
    assert.equal(await storage.verify(saved.key, saved.sha256), true);
    assert.equal(await storage.verify(saved.key, '0'.repeat(64)), false);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.retrieve(saved.key)) chunks.push(chunk as Buffer);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    await storage.delete(saved.key);
    assert.equal(await storage.exists(saved.key), false);
    assert.equal(await storage.metadata(saved.key), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('private filesystem storage rejects path-like object identifiers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'audiotrust-storage-'));
  const storage = new LocalFilesystemStorage(root);
  try {
    await assert.rejects(() => storage.exists('../outside'), /Invalid storage key/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('private filesystem storage removes partial output when upload exceeds limit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'audiotrust-storage-'));
  const storage = new LocalFilesystemStorage(root);
  try {
    await assert.rejects(
      () => storage.save(Readable.from([Buffer.from('too large')]), 'audio/wav', 2),
      /Upload exceeds configured size limit/,
    );
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
