import type { SyncResult } from './syncEngine';
import type { NativeDeviceSwitchState } from './nativeDeviceSwitch';

export function inspectOriginalNotesTransfer(
  state: NativeDeviceSwitchState,
  result: Pick<SyncResult, 'failed' | 'deferred' | 'conflicts' | 'conflictCopies'> | null,
) {
  if (!state.ownerId || !state.accessGranted || state.recoveryMode ||
      state.status === 'setup' || state.status === 'recovery')
    return { status: 'account-required' as const,
      message: 'Original Notes Account authorization is not active. Keep local drafts and open Backup & import; do not assume another device has them.' };
  if (state.status !== 'synced' || state.lastSyncedAt === null ||
      state.lastSyncedAt > state.now || !result)
    return { status: 'retry-native' as const,
      message: 'Original SyncProvider does not confirm a current successful sync result. Retry native synchronization and inspect pending edits before switching devices.' };
  if (result.failed > 0 || result.deferred > 0)
    return { status: 'pending-original-records' as const,
      message: result.failed + ' failed and ' + result.deferred +
        ' deferred native sync records remain. They were retained locally; close active editors and retry original Notes sync. Do not treat another device as current.' };
  if (result.conflicts > 0 || result.conflictCopies > 0)
    return { status: 'review-original-conflicts' as const,
      message: 'Original Notes synchronization reported conservatively handled conflicts. Review original preserved conflict copies and saved versions before switching devices.' };
  if (!state.manualBackupAt || state.manualBackupAt > state.now)
    return { status: 'export-required' as const,
      message: 'SyncProvider reported a clean native sync, but a saved full backup has not been verified. Export from original BackupWorkspace, choose the actual saved file, then compare it with the current device.' };
  return { status: 'verify-file' as const,
    message: 'Original native sync reported success and an export was requested. Use original BackupWorkspace to validate the actual saved file and compare all record categories, attachments and revisions. Neither event proves remote retention.' };
}
