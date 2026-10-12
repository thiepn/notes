import { useEffect, useMemo, useRef } from 'react';

import { useSync, type SyncStatus } from './SyncContext';
import { hasNotesCoreConsent } from './coreConsent';
import { requestOwnedNotesSync, type CoreRequestOutcome } from './coreRequest';

export type NotesCorePermission = {
  ownerId: string | null;
  authorized: boolean;
  state: SyncStatus;
};
export function canRequestNotesCoreSync(
  permission: NotesCorePermission,
  expectedOwner: string,
): boolean {
  return permission.ownerId === expectedOwner && permission.authorized &&
    !['local','setup','recovery','offline','connecting'].includes(permission.state);
}

/** Notes' own app-only request port. No native data/tokens leave SyncProvider. */
export function useNotesCoreSyncAdapter() {
  const { accountId, accessGranted, recoveryMode, status, syncNow } = useSync();
  const live = useRef<NotesCorePermission>({ ownerId: null, authorized: false, state: 'local' });
  const pending = useRef(false);
  useEffect(() => {
    live.current = {
      ownerId: accountId,
      authorized: accessGranted && !recoveryMode,
      state: status,
    };
  }, [accountId, accessGranted, recoveryMode, status]);
  return useMemo(() => ({
    readStatus: (): NotesCorePermission => ({
      ...live.current,
      authorized: live.current.authorized && hasNotesCoreConsent(live.current.ownerId),
    }),
    requestSync: async (expectedOwner: string): Promise<CoreRequestOutcome> => {
      if (pending.current) return 'busy';
      pending.current = true;
      try {
        return await requestOwnedNotesSync(expectedOwner,
          () => ({
            ...live.current,
            authorized: live.current.authorized && hasNotesCoreConsent(live.current.ownerId),
          }),
          syncNow,
        );
      } finally {
        pending.current = false;
      }
    },
  }), [syncNow]);
}
