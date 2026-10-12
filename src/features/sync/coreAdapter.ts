import { useMemo } from 'react';

import { useSync, type SyncStatus } from './SyncContext';
import { hasNotesCoreConsent } from './coreConsent';

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
  return useMemo(
    () => ({
      readStatus: (): NotesCorePermission => ({
        ownerId: accountId,
        authorized: accessGranted && !recoveryMode && hasNotesCoreConsent(accountId),
        state: status,
      }),
      requestSync: async (expectedOwner: string): Promise<'requested' | 'denied'> => {
        const current = {
          ownerId: accountId,
          authorized: accessGranted && !recoveryMode && hasNotesCoreConsent(accountId),
          state: status,
        };
        if (!canRequestNotesCoreSync(current, expectedOwner)) return 'denied';
        // Recheck before calling the native authority; device revocation wins.
        if (!hasNotesCoreConsent(accountId)) return 'denied';
        await syncNow();
        // Notes owns the eventual outcome; callers must separately re-read it.
        return 'requested';
      },
    }),
    [accountId, accessGranted, recoveryMode, status, syncNow],
  );
}
