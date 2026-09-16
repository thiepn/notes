import type { SyncResult } from './syncEngine';

export function formatSyncActivity(result: SyncResult): string {
  const parts: string[] = [];
  pushCount(parts, result.uploaded, 'uploaded');
  pushCount(parts, result.downloaded, 'downloaded');
  pushCount(parts, result.deletedRemote, 'cloud deletion', 'cloud deletions');
  pushCount(parts, result.deletedLocal, 'local deletion', 'local deletions');
  pushCount(parts, result.conflicts, 'conflict', 'conflicts');
  pushCount(parts, result.conflictCopies, 'safety copy', 'safety copies');
  pushCount(parts, result.failed, 'failed record', 'failed records');
  pushCount(parts, result.deferred, 'pending record', 'pending records');
  return parts.length > 0 ? parts.join(' · ') : 'No record changes.';
}

export function syncAttentionCopy(
  status: 'offline' | 'pending' | 'error',
  result: SyncResult | null,
): { title: string; detail: string; action: string } {
  if (status === 'offline') {
    return {
      title: 'Waiting for a connection',
      detail: 'Notes remain saved locally. Sync resumes automatically when this device reconnects.',
      action: 'Check connection',
    };
  }
  if (status === 'pending') {
    return {
      title: 'Local changes are waiting',
      detail:
        result?.deferred && result.deferred > 0
          ? `${result.deferred} ${result.deferred === 1 ? 'record is' : 'records are'} still pending. Close any editor that is holding a newer local draft, then retry.`
          : 'Some local changes are waiting for a safe sync point. Close any open editor, then retry.',
      action: 'Retry sync',
    };
  }
  return {
    title: 'Sync needs attention',
    detail:
      result?.failed && result.failed > 0
        ? `${result.failed} ${result.failed === 1 ? 'record could' : 'records could'} not sync. Local data was kept.`
        : 'The last cloud sync did not complete. Local data was kept.',
    action: 'Retry sync',
  };
}

function pushCount(parts: string[], count: number, singular: string, plural = singular): void {
  if (count <= 0) return;
  parts.push(`${count} ${count === 1 ? singular : plural}`);
}
