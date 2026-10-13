import type { SyncStatus } from './SyncContext';

export interface NativeDeviceSwitchState {
  ownerId: string | null;
  accessGranted: boolean;
  recoveryMode: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  manualBackupAt: number | null;
  now: number;
}

/** Read-only advice from ORIGINAL SyncProvider and BackupWorkspace; not a recovery writer. */
export function inspectNativeDeviceSwitch(state: NativeDeviceSwitchState) {
  if (!state.ownerId || !state.accessGranted)
    return {
      status: 'local-only' as const,
      next: 'This device has no authorized original Notes cloud workspace. Keep local Notes and use the original Backup & import workspace for manual recovery.',
      externalCustody: 'NOT_TESTED' as const,
    };
  if (state.recoveryMode || state.status === 'recovery' || state.status === 'setup')
    return {
      status: 'account-action-required' as const,
      next: 'Finish the original Notes Account recovery or setup before moving cloud data. Keep local records and exports intact.',
      externalCustody: 'NOT_TESTED' as const,
    };
  if (
    state.status !== 'synced' ||
    state.lastSyncedAt === null ||
    !Number.isSafeInteger(state.lastSyncedAt) ||
    state.lastSyncedAt > state.now
  )
    return {
      status: 'native-not-confirmed' as const,
      next: 'Native Notes is not currently confirmed synced. Inspect pending edits and conflicts, use original SyncProvider retry, then preserve a BackupWorkspace export.',
      externalCustody: 'NOT_TESTED' as const,
    };
  if (
    state.manualBackupAt === null ||
    !Number.isSafeInteger(state.manualBackupAt) ||
    state.manualBackupAt > state.now
  )
    return {
      status: 'backup-not-evidenced' as const,
      next: 'Notes reported native synchronization, but no device-local manual export marker was observed. Use Backup & import and verify the downloaded file before moving devices.',
      externalCustody: 'NOT_TESTED' as const,
    };
  return {
    status: 'manual-verification-needed' as const,
    next: 'Original SyncProvider previously reported success and BackupWorkspace has a device-local export timestamp. Neither proves a saved matching backup, owner attribution, current remote durability or safe restoration. Verify the actual file and compare the next device using original Notes sync.',
    externalCustody: 'NOT_TESTED' as const,
  };
}
