import type { SyncStatus } from './SyncContext';

export type RecoveryAction = 'inspect' | 'native-retry-requested' |
  'native-backup-opened' | 'core-consent-enabled' | 'core-device-revoked';

export interface RecoveryEntry {
  action: RecoveryAction;
  nativeStatus: SyncStatus;
  grantRevision: number | null;
  lastConfirmedNativeSync: number | null;
  at: number;
  authority: 'original-notes';
  externalCustody: 'NOT_TESTED';
}
export interface RecoveryHistory {
  ownerId: string | null;
  entries: RecoveryEntry[];
}

/** In-memory observations, not a second database or a signed audit record. */
export function appendRecoveryEntry(
  previous: RecoveryHistory,
  ownerId: string | null,
  entry: Omit<RecoveryEntry, 'at' | 'authority' | 'externalCustody'>,
  at: number,
): RecoveryHistory {
  if (!Number.isSafeInteger(at) || at < 0) return { ownerId, entries: [] };
  const existing = previous.ownerId === ownerId ? previous.entries : [];
  return {
    ownerId,
    entries: [...existing, {
      ...entry,
      at,
      authority: 'original-notes' as const,
      externalCustody: 'NOT_TESTED' as const,
    }].slice(-16),
  };
}
export function visibleRecoveryEntries(history: RecoveryHistory, ownerId: string | null) {
  return history.ownerId === ownerId ? history.entries.map((entry) => ({ ...entry })) : [];
}
export function nativeRecoveryEvidence(status: SyncStatus, lastSyncedAt: number | null) {
  return {
    confirmed: status === 'synced' && lastSyncedAt !== null,
    detail: status === 'synced' && lastSyncedAt !== null
      ? 'Original SyncProvider previously confirmed synchronization.'
      : status === 'offline' || status === 'pending'
        ? 'Local notes remain available; no new cloud confirmation exists.'
        : status === 'error'
          ? 'Export through BackupWorkspace before attempting native sync again.'
          : 'SyncProvider owns cloud confirmation; BackupWorkspace owns exports.',
    externalCustody: 'NOT_TESTED' as const,
  };
}
