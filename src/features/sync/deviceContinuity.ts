import type { SyncStatus } from './SyncContext';
import { inspectNotesNativeHandoff } from './nativeRecoveryHandoff';

/** Original provider epoch fencing, including token changes from another tab. */
export function nativeSessionTransition(
  oldOwner: string | null,
  newOwner: string | null,
  externalCredentialsChanged: boolean,
): 'owner-changed' | 'external-credentials-changed' | 'same-session' {
  if (oldOwner !== newOwner) return 'owner-changed';
  if (externalCredentialsChanged) return 'external-credentials-changed';
  return 'same-session';
}

/** Observational comparison only; original SyncProvider owns actual records. */
export function compareNotesNativeDevices(input: {
  remoteJson: string;
  ownerId: string;
  localStatus: SyncStatus;
  localLastConfirmedSync: number | null;
  now: number;
}) {
  const remote = inspectNotesNativeHandoff(input.remoteJson, input.ownerId, input.now);
  if (remote.status !== 'candidate') return remote;
  if (input.localStatus !== 'synced' || input.localLastConfirmedSync === null)
    return {
      status: 'local-unconfirmed' as const,
      action:
        'The other device reports an unsigned native sync checkpoint, but this device has no current confirmed sync. Check the original SyncProvider and export with BackupWorkspace before importing.',
    };
  return {
    status: 'two-native-claims' as const,
    action:
      'Both devices report native sync activity. These are separate, unsigned observations, not evidence of matching Notes, a common revision, or durable custody. Use original Notes sync/conflict and BackupWorkspace to reconcile.',
  };
}

/** B19 owner-facing recovery workflow; no extra writer, restore or certification. */
export function nativeDeviceRecoverySteps(input: {
  status: SyncStatus;
  lastSyncedAt: number | null;
  deviceBackupAt: number | null;
}): string[] {
  const recentNative = input.status === 'synced' && input.lastSyncedAt !== null;
  const backup = input.deviceBackupAt !== null && Number.isSafeInteger(input.deviceBackupAt);
  return [
    recentNative
      ? 'Inspect the original Notes sync result and unresolved conflicts before changing devices.'
      : 'Keep this device and its local notes intact. Reconnect the original Notes Account and inspect pending or failed sync first.',
    backup
      ? 'BackupWorkspace recorded a manual export on this browser, but its existence and Account ownership are not independently proven. Verify your saved file before restoration.'
      : 'Open the original Backup & import workspace and download an owner-controlled local backup before any restoration.',
    'Use original Notes SyncProvider to reconcile cloud records on the other device; compare unsigned device summaries only as context, never as authorization or proof of matching data.',
  ];
}

/** Reject late original session-list responses from a different credential epoch. */
export function isCurrentNativeSessionResponse(input: {
  requestedOwner: string;
  requestedAccessToken: string;
  requestedEpoch: number;
  currentOwner: string | null;
  currentAccessToken: string | null;
  currentEpoch: number;
}) {
  return (
    input.requestedOwner === input.currentOwner &&
    input.requestedAccessToken === input.currentAccessToken &&
    input.requestedEpoch === input.currentEpoch
  );
}
