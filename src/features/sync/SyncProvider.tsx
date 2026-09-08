import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { synchronizeNotes, type SyncResult } from './syncEngine';
import {
  ensureFreshSession,
  readStoredSession,
  refreshSession,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  storeSession,
  type SupabaseSession,
} from './supabaseApi';

export type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncContextValue {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  message: string | null;
  lastResult: SyncResult | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);
const AUTO_SYNC_MS = 15_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(() => readStoredSession());
  const [status, setStatus] = useState<SyncStatus>(() => (session ? 'connecting' : 'local'));
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const updateSession = useCallback((next: SupabaseSession | null) => {
    setSession(next);
    storeSession(next);
  }, []);

  const syncNow = useCallback(async () => {
    if (!session) {
      setStatus('local');
      return;
    }
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
        const fresh = await ensureFreshSession(session);
        if (fresh.access_token !== session.access_token) updateSession(fresh);
        const result = await synchronizeNotes(fresh);
        setLastResult(result);
        setLastSyncedAt(Date.now());
        setStatus('synced');
        setMessage(result.conflicts > 0 ? `${result.conflicts} sync conflict${result.conflicts === 1 ? '' : 's'} resolved conservatively.` : null);
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
  }, [session, updateSession]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void refreshSession(session)
      .then((fresh) => {
        if (cancelled) return;
        updateSession(fresh);
        setStatus('connecting');
      })
      .catch(() => {
        if (cancelled) return;
        updateSession(null);
        setStatus('local');
        setMessage('Your saved cloud session expired. Sign in again to resume sync.');
      });
    return () => {
      cancelled = true;
    };
    // Refresh the persisted session once when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    void syncNow();
  }, [session?.access_token, syncNow]);

  useEffect(() => {
    if (!session) return;
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
  }, [session, syncNow]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setStatus('connecting');
      setMessage(null);
      try {
        const next = await signInWithPassword(email.trim(), password);
        updateSession(next);
      } catch (error) {
        setStatus('local');
        setMessage(error instanceof Error ? error.message : 'Sign-in failed.');
        throw error;
      }
    },
    [updateSession],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<'signed-in' | 'confirm-email'> => {
      setStatus('connecting');
      setMessage(null);
      try {
        const result = await signUpWithPassword(email.trim(), password);
        if (result.session) {
          updateSession(result.session);
          return 'signed-in';
        }
        setStatus('local');
        setMessage('Account created. Confirm the email, then sign in to enable sync.');
        return 'confirm-email';
      } catch (error) {
        setStatus('local');
        setMessage(error instanceof Error ? error.message : 'Account creation failed.');
        throw error;
      }
    },
    [updateSession],
  );

  const signOut = useCallback(async () => {
    const current = session;
    updateSession(null);
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
      lastSyncedAt,
      message,
      lastResult,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [lastResult, lastSyncedAt, message, session?.user.email, signIn, signOut, signUp, status, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider.');
  return value;
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local':
      return 'Local only';
    case 'connecting':
      return 'Connecting';
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return 'Synced';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Sync error';
  }
}
