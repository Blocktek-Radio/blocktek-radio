import type { Readable } from 'node:stream';

export type StoredObject = { key: string; size: number; sha256: string; contentType: string };

export interface StorageProvider {
  save(source: Readable, contentType: string, maxBytes: number): Promise<StoredObject>;
  retrieve(key: string): Readable;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<Omit<StoredObject, 'contentType'> | null>;
  verify(key: string, expectedSha256: string): Promise<boolean>;
}
