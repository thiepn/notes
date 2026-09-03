export type StoragePersistence = 'persistent' | 'best-effort' | 'unsupported';

export interface StorageHealth {
  persistence: StoragePersistence;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
  canRequestPersistence: boolean;
}

export async function readStorageHealth(
  manager: StorageManager | null = browserStorageManager(),
): Promise<StorageHealth> {
  if (!manager) {
    return {
      persistence: 'unsupported',
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      canRequestPersistence: false,
    };
  }

  const persisted = await safePersisted(manager);
  const estimate = await safeEstimate(manager);
  const usageBytes = finiteBytes(estimate?.usage);
  const quotaBytes = finiteBytes(estimate?.quota);
  const usageRatio =
    usageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? Math.min(1, usageBytes / quotaBytes)
      : null;

  return {
    persistence: persisted === true ? 'persistent' : 'best-effort',
    usageBytes,
    quotaBytes,
    usageRatio,
    canRequestPersistence: persisted !== true && typeof manager.persist === 'function',
  };
}

export async function requestPersistentStorage(
  manager: StorageManager | null = browserStorageManager(),
): Promise<StorageHealth> {
  if (manager && typeof manager.persist === 'function') {
    try {
      await manager.persist();
    } catch {
      // Storage persistence is a browser policy decision; refresh the observable state either way.
    }
  }
  return readStorageHealth(manager);
}

export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'] as const;
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}

function browserStorageManager(): StorageManager | null {
  if (typeof navigator === 'undefined' || !navigator.storage) return null;
  return navigator.storage;
}

async function safePersisted(manager: StorageManager): Promise<boolean | null> {
  if (typeof manager.persisted !== 'function') return null;
  try {
    return await manager.persisted();
  } catch {
    return null;
  }
}

async function safeEstimate(manager: StorageManager): Promise<StorageEstimate | null> {
  if (typeof manager.estimate !== 'function') return null;
  try {
    return await manager.estimate();
  } catch {
    return null;
  }
}

function finiteBytes(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
