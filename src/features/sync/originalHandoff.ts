import type { SyncStatus } from './SyncContext';

/**
 * Owner-only presentation of ORIGINAL Notes SyncProvider results.
 * No record bodies, token, backup filename or cloud snapshot is loaded.
 */
export function assessOriginalNotesHandoff(input: {
  ownerId: string | null;
  accessGranted: boolean;
  recoveryMode: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  failed: number | null;
  deferred: number | null;
  conflicts: number | null;
  manualBackupAt: number | null;
  now: number;
}) {
  const out = (
    phase:
      | 'account-required'
      | 'native-in-progress'
      | 'native-pending'
      | 'review-conflicts'
      | 'backup-needed'
      | 'verify-saved-file',
    action: string,
  ) => ({
    phase,
    action,
    nativeImport: 'NOT_PERFORMED' as const,
    externalCustody: 'NOT_TESTED' as const,
  });
  if (!input.ownerId || !input.accessGranted || input.recoveryMode)
    return out(
      'account-required',
      'Keep local Notes. Finish original Account authorization before any cross-device cloud recovery; original Backup & import stays available.',
    );
  if (input.status === 'connecting' || input.status === 'syncing')
    return out(
      'native-in-progress',
      'Native Notes synchronization is still in progress. Do not assume the next device has the same records.',
    );
  if (
    input.status !== 'synced' ||
    input.lastSyncedAt === null ||
    !Number.isSafeInteger(input.lastSyncedAt) ||
    input.lastSyncedAt > input.now ||
    (input.failed ?? 0) > 0 ||
    (input.deferred ?? 0) > 0
  )
    return out(
      'native-pending',
      'Original Notes still reports pending, failed, offline or unconfirmed synchronization. Resolve this in SyncProvider; preserve a local BackupWorkspace export before switching.',
    );
  if ((input.conflicts ?? 0) > 0)
    return out(
      'review-conflicts',
      'Original Notes reports a conservative conflict resolution. Inspect the affected notes using original Notes before relying on a second device or restoring a backup.',
    );
  if (
    input.manualBackupAt === null ||
    !Number.isSafeInteger(input.manualBackupAt) ||
    input.manualBackupAt > input.now
  )
    return out(
      'backup-needed',
      'Native Notes previously reported sync success. Export a portable original Notes backup from Backup & import and verify that the browser saved it.',
    );
  return out(
    'verify-saved-file',
    'Native Notes previously reported sync success and this browser has a device-local export timestamp. The timestamp is not owner-attributed and does not prove a matching, saved backup. Inspect the actual file; then compare original native records on the next device.',
  );
}
