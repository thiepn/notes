import { describe, expect, it } from 'vitest';

import { formatStorageBytes, readStorageHealth } from './storageHealth';

describe('storage health', () => {
  it('formats storage estimates compactly', () => {
    expect(formatStorageBytes(null)).toBe('Unknown');
    expect(formatStorageBytes(1024)).toBe('1.00 KiB');
    expect(formatStorageBytes(25 * 1024 * 1024)).toBe('25.0 MiB');
  });

  it('reports persistence and quota without mutating storage', async () => {
    const manager = {
      persisted: async () => true,
      estimate: async () => ({ usage: 25, quota: 100 }),
      persist: async () => true,
    } as unknown as StorageManager;
    await expect(readStorageHealth(manager)).resolves.toEqual({
      persistence: 'persistent',
      usageBytes: 25,
      quotaBytes: 100,
      usageRatio: 0.25,
      canRequestPersistence: false,
    });
  });
});
