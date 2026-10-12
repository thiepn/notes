import { useEffect, useMemo, useRef } from 'react';

import { useSync, type SyncStatus } from './SyncContext';
import { hasNotesCoreConsent, getNotesCoreRevision } from './coreConsent';

/** B9 consumer contract: Notes still owns Supabase writes and rich-data transport. */
export type NotesCorePermission = {
  ownerId: string | null;
  authorized: boolean;
  state: SyncStatus;
};
export function canRequestNotesCoreSync(
  permission: NotesCorePermission,
  expectedOwner: string,
): boolean {
  return (
    permission.ownerId === expectedOwner &&
    permission.authorized &&
    !['local', 'setup', 'recovery', 'offline', 'connecting'].includes(permission.state)
  );
}
/**
 * Use inside Notes only. External Core consumers must never receive a
 * SupabaseSession, access token, or native Notes record from this interface.
 * A completed request is NOT proof that Notes' state became 'synced'.
 */
export function useNotesCoreSyncAdapter() {
  const { accountId, accessGranted, recoveryMode, status, syncNow } = useSync();
  const currentRef = useRef({ accountId, accessGranted, recoveryMode, status });
  useEffect(() => {
    currentRef.current = { accountId, accessGranted, recoveryMode, status };
  }, [accountId, accessGranted, recoveryMode, status]);
  return useMemo(
    () => ({
      readStatus: (): NotesCorePermission => {
        const current = currentRef.current;
        return {
          ownerId: current.accountId,
          authorized:
            current.accessGranted &&
            !current.recoveryMode &&
            hasNotesCoreConsent(current.accountId),
          state: current.status,
        };
      },
      requestSync: async (expectedOwner: string): Promise<'requested' | 'denied'> => {
        const latest = currentRef.current;
        const permission: NotesCorePermission = {
          ownerId: latest.accountId,
          authorized:
            latest.accessGranted && !latest.recoveryMode && hasNotesCoreConsent(latest.accountId),
          state: latest.status,
        };
        if (!canRequestNotesCoreSync(permission, expectedOwner)) return 'denied';
        const deviceRevision = getNotesCoreRevision(expectedOwner);
        if (deviceRevision === null) return 'denied';
        await syncNow();
        // A completed request is not a confirmed cloud write. The native
        // engine reports success separately. Account/device revocation wins.
        const after = currentRef.current;
        if (
          after.accountId !== expectedOwner ||
          !after.accessGranted ||
          after.recoveryMode ||
          !hasNotesCoreConsent(expectedOwner) ||
          getNotesCoreRevision(expectedOwner) !== deviceRevision
        )
          return 'denied';
        return 'requested';
      },
    }),
    [syncNow],
  );
}
