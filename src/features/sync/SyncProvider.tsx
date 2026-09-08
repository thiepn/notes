import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { SyncContext, type SyncContextValue, type SyncStatus } from './SyncContext';
import { synchronizeNotes, type SyncResult } from './syncEngine';
import {
  claimNotesSyncAccess,
  ensureFreshSession,
  hasNotesSyncAccess,
  readStoredSession,
  refreshSession,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  storeSession,
  type SupabaseSession,
} from './supabaseApi';

const AUTO_SYNC_MS = 15_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(() => readStoredSession());
  const [accessGranted, setAccessGranted] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(() => (session ? 'connecting' : 'local'));
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const initialSessionRef = useRef(session);

  const updateSession = useCallback((next: SupabaseSession | null) => {
    setSession(next);
    storeSession(next);
  }, []);

  const runSync = useCallback(
    async (targetSession: SupabaseSession) => {
      if (!navigator.onLine) {
        setStatus('offline');
        setMessage('Offline. Changes are saved locally and will sync when you reconnect.');
        return;
      }
      if (syncPromiseRef.current) return syncPromiseRef.current;

      const operation = (async () => {
        setStatus('syncing');
        setMessage(null);
        try {
          const fresh = await ensureFreshSession(targetSession);
          if (fresh.access_token !== targetSession.access_token) updateSession(fresh);
          const result = await synchronizeNotes(fresh);
          setLastResult(result);
          setLastSyncedAt(Date.now());
          setStatus('synced');
          setMessage(
            result.conflicts > 0
              ? `${result.conflicts} sync conflict${result.conflicts === 1 ? '' : 's'} resolved conservatively.`
              : null,
          );
        } catch (error) {
          setStatus(navigator.onLine ? 'error' : 'offline');
          setMessage(error instanceof Error ? error.message : 'Notes could not sync.');
        }
      })();

      syncPromiseRef.current = operation;
      try {
        await operation;
      } finally {
        syncPromiseRef.current = null;
      }
    },
    [updateSession],
  );

  const activateSession = useCallback(
    async (targetSession: SupabaseSession) => {
      const granted = await hasNotesSyncAccess(targetSession);
      setAccessGranted(granted);
      if (!granted) {
        setStatus('setup');
        setMessage('This account has not claimed the private Notes workspace yet.');
        return;
      }
      await runSync(targetSession);
    },
    [runSync],
  );

  const syncNow = useCallback(async () => {
    if (!session) {
      setStatus('local');
      return;
    }
    if (!accessGranted) {
      setStatus('setup');
      setMessage('Enter the one-time setup code to enable this Notes workspace.');
      return;
    }
    await runSync(session);
  }, [accessGranted, runSync, session]);

  useEffect(() => {
    const initialSession = initialSessionRef.current;
    if (!initialSession) return;

    let cancelled = false;
    void refreshSession(initialSession)
      .then(async (fresh) => {
        if (cancelled) return;
        updateSession(fresh);
        await activateSession(fresh);
      })
      .catch(() => {
        if (cancelled) return;
        updateSession(null);
        setAccessGranted(false);
        setStatus('local');
        setMessage('Your saved cloud session expired. Sign in again to resume sync.');
      });

    return () => {
      cancelled = true;
    };
  }, [activateSession, updateSession]);

  useEffect(() => {
    if (!session || !accessGranted) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, AUTO_SYNC_MS);
    const handleOnline = () => void syncNow();
    const handleFocus = () => void syncNow();
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [accessGranted, session, syncNow]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setStatus('connecting');
      setMessage(null);
      try {
        const next = await signInWithPassword(email.trim(), password);
        updateSession(next);
        await activateSession(next);
      } catch (error) {
        setAccessGranted(false);
        setStatus('local');
        setMessage(error instanceof Error ? error.message : 'Sign-in failed.');
        throw error;
      }
    },
    [activateSession, updateSession],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<'signed-in' | 'confirm-email'> => {
      setStatus('connecting');
      setMessage(null);
      try {
        const result = await signUpWithPassword(email.trim(), password);
        if (result.session) {
          updateSession(result.session);
          await activateSession(result.session);
          return 'signed-in';
        }
        setAccessGranted(false);
        setStatus('local');
        setMessage('Account created. Confirm the email, then sign in to continue setup.');
        return 'confirm-email';
      } catch (error) {
        setAccessGranted(false);
        setStatus('local');
        setMessage(error instanceof Error ? error.message : 'Account creation failed.');
        throw error;
      }
    },
    [activateSession, updateSession],
  );

  const claimAccess = useCallback(
    async (setupCode: string): Promise<boolean> => {
      if (!session) return false;
      setStatus('connecting');
      setMessage(null);
      try {
        const fresh = await ensureFreshSession(session);
        if (fresh.access_token !== session.access_token) updateSession(fresh);
        const claimed = await claimNotesSyncAccess(fresh, setupCode.trim());
        if (!claimed) {
          setAccessGranted(false);
          setStatus('setup');
          setMessage(
            'The setup code is invalid, or the private Notes workspace is already claimed.',
          );
          return false;
        }
        setAccessGranted(true);
        await runSync(fresh);
        return true;
      } catch (error) {
        setAccessGranted(false);
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage(error instanceof Error ? error.message : 'Workspace setup failed.');
        return false;
      }
    },
    [runSync, session, updateSession],
  );

  const signOut = useCallback(async () => {
    const current = session;
    updateSession(null);
    setAccessGranted(false);
    setStatus('local');
    setLastSyncedAt(null);
    setLastResult(null);
    setMessage('Cloud sync is off. Notes remain stored on this device.');
    if (current) {
      try {
        await signOutSession(current);
      } catch {
        // Local sign-out already completed; remote token expiry/revocation can happen independently.
      }
    }
  }, [session, updateSession]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      email: session?.user.email ?? null,
      accessGranted,
      lastSyncedAt,
      message,
      lastResult,
      signIn,
      signUp,
      claimAccess,
      signOut,
      syncNow,
    }),
    [
      accessGranted,
      claimAccess,
      lastResult,
      lastSyncedAt,
      message,
      session?.user.email,
      signIn,
      signOut,
      signUp,
      status,
      syncNow,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
