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
