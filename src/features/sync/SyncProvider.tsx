import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { SyncContext, type SyncContextValue, type SyncStatus } from './SyncContext';
import type { AuthSessionInfo, DeleteAccountResult } from './accountApi';
import type { SyncResult } from './syncEngine';
import {
  claimNotesSyncAccess,
  ensureFreshSession,
  hasNotesSyncAccess,
  readStoredSession,
  refreshSession,
  signInWithPassword,
  signOutSession,
  storeSession,
  type SupabaseSession,
} from './supabaseApi';

const AUTO_SYNC_MS = 15_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(() => readStoredSession());
  const [accessGranted, setAccessGranted] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([]);
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

  const clearSessionState = useCallback(
    (nextMessage: string) => {
      updateSession(null);
      setAccessGranted(false);
      setRecoveryMode(false);
      setPendingEmail(null);
      setSessions([]);
      setStatus('local');
      setLastSyncedAt(null);
      setLastResult(null);
      setMessage(nextMessage);
    },
    [updateSession],
  );

  const refreshSessionListFor = useCallback(async (targetSession: SupabaseSession) => {
    try {
      const { listAuthSessions } = await import('./accountApi');
      setSessions(await listAuthSessions(targetSession));
    } catch {
      setSessions([]);
    }
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
          const { synchronizeNotes } = await import('./syncEngine');
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
        setSessions([]);
        setStatus('setup');
        setMessage('This account has not claimed the private Notes workspace yet.');
        return;
      }
      await runSync(targetSession);
      await refreshSessionListFor(targetSession);
    },
    [refreshSessionListFor, runSync],
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
    let cancelled = false;

    const initialize = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          (window.location.hash.includes('access_token=') ||
            window.location.hash.includes('error='))
        ) {
          const { consumeAuthCallback } = await import('./accountApi');
          const callback = await consumeAuthCallback();
          if (cancelled || !callback) return;

          if (callback.error || !callback.session) {
            setStatus('error');
            setMessage(callback.error ?? 'The authentication link could not be completed.');
            return;
          }

          updateSession(callback.session);
          await activateSession(callback.session);
          if (cancelled) return;

          if (callback.type === 'recovery') {
            setRecoveryMode(true);
            setStatus('recovery');
            setMessage('Password recovery verified. Choose a new password below.');
          } else if (callback.type === 'email_change') {
            setPendingEmail(null);
            setMessage('Email address updated.');
          } else if (callback.type === 'signup') {
            setMessage('Email address confirmed.');
          }
          return;
        }

        const initialSession = initialSessionRef.current;
        if (!initialSession) return;
        const fresh = await refreshSession(initialSession);
        if (cancelled) return;
        updateSession(fresh);
        await activateSession(fresh);
      } catch (error) {
        if (cancelled) return;
        clearSessionState(
          error instanceof Error
            ? error.message
            : 'Your saved cloud session expired. Sign in again to resume sync.',
        );
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [activateSession, clearSessionState, updateSession]);

  useEffect(() => {
    if (!session || !accessGranted || recoveryMode) return;
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
  }, [accessGranted, recoveryMode, session, syncNow]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setStatus('connecting');
      setMessage(null);
      try {
        const next = await signInWithPassword(email.trim(), password);
        updateSession(next);
        setRecoveryMode(false);
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
        const { signUpAccount } = await import('./accountApi');
        const result = await signUpAccount(email.trim(), password);
        if (result.session) {
          updateSession(result.session);
          setRecoveryMode(false);
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
        await refreshSessionListFor(fresh);
        return true;
      } catch (error) {
        setAccessGranted(false);
        setStatus(navigator.onLine ? 'error' : 'offline');
        setMessage(error instanceof Error ? error.message : 'Workspace setup failed.');
        return false;
      }
    },
    [refreshSessionListFor, runSync, session, updateSession],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const { requestPasswordReset: requestReset } = await import('./accountApi');
    await requestReset(email.trim());
    setMessage('If that email belongs to an account, a password-reset link has been sent.');
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const { resendSignupConfirmation } = await import('./accountApi');
    await resendSignupConfirmation(email.trim());
    setMessage('A new verification email has been requested.');
  }, []);

  const changeEmail = useCallback(
    async (email: string) => {
      if (!session) throw new Error('Sign in again to continue.');
      const fresh = await ensureFreshSession(session);
      const { updateAccountEmail } = await import('./accountApi');
      const user = await updateAccountEmail(fresh, email.trim());
      updateSession({ ...fresh, user });
      setPendingEmail(email.trim());
      setMessage('Email change requested. Follow the confirmation link sent by Supabase.');
    },
    [session, updateSession],
  );

  const resendEmailChange = useCallback(async () => {
    if (!session || !pendingEmail) throw new Error('No pending email change is available.');
    const fresh = await ensureFreshSession(session);
    const { resendEmailChangeConfirmation } = await import('./accountApi');
    await resendEmailChangeConfirmation(fresh, pendingEmail);
    setMessage('The email-change confirmation was requested again.');
  }, [pendingEmail, session]);

  const requestReauthentication = useCallback(async () => {
    if (!session) throw new Error('Sign in again to continue.');
    const fresh = await ensureFreshSession(session);
    const { requestReauthentication: requestCode } = await import('./accountApi');
    await requestCode(fresh);
    setMessage('A password-change verification code has been sent to your email.');
  }, [session]);

  const changePassword = useCallback(
    async (password: string, options: { currentPassword?: string; nonce?: string } = {}) => {
      if (!session) throw new Error('Open a valid recovery link or sign in first.');
      const fresh = await ensureFreshSession(session);
      const { updateAccountPassword } = await import('./accountApi');
      const user = await updateAccountPassword(fresh, password, options);
      updateSession({ ...fresh, user });
      setRecoveryMode(false);
      setStatus(accessGranted ? 'synced' : 'setup');
      setMessage('Password updated.');
    },
    [accessGranted, session, updateSession],
  );

  const refreshSessions = useCallback(async () => {
    if (!session || !accessGranted) {
      setSessions([]);
      return;
    }
    const fresh = await ensureFreshSession(session);
    if (fresh.access_token !== session.access_token) updateSession(fresh);
    await refreshSessionListFor(fresh);
  }, [accessGranted, refreshSessionListFor, session, updateSession]);

  const signOutOtherDevices = useCallback(async () => {
    if (!session) return;
    const fresh = await ensureFreshSession(session);
    const { signOutScoped } = await import('./accountApi');
    await signOutScoped(fresh, 'others');
    setMessage('Other signed-in sessions were revoked.');
    await refreshSessionListFor(fresh);
  }, [refreshSessionListFor, session]);

  const signOutAllDevices = useCallback(async () => {
    const current = session;
    if (!current) return;
    try {
      const fresh = await ensureFreshSession(current);
      const { signOutScoped } = await import('./accountApi');
      await signOutScoped(fresh, 'global');
    } finally {
      clearSessionState('Signed out on all devices. Local Notes data remains on this device.');
    }
  }, [clearSessionState, session]);

  const deleteCloudData = useCallback(async () => {
    if (!session || !accessGranted) throw new Error('Cloud sync is not active.');
    const fresh = await ensureFreshSession(session);
    const { deleteNotesCloudData } = await import('./accountApi');
    await deleteNotesCloudData(fresh);
    try {
      await signOutSession(fresh);
    } finally {
      clearSessionState(
        'Cloud Notes data was deleted and sync was turned off. The local library remains here.',
      );
    }
  }, [accessGranted, clearSessionState, session]);

  const deleteAccount = useCallback(async (): Promise<DeleteAccountResult> => {
    if (!session || !accessGranted) {
      return { deleted: false, reason: 'notes_access_required' };
    }
    const fresh = await ensureFreshSession(session);
    const { deleteNotesAccountIdentity } = await import('./accountApi');
    const result = await deleteNotesAccountIdentity(fresh);
    if (result.deleted) {
      clearSessionState('The Notes account identity and cloud data were deleted.');
    } else if (result.reason === 'shared_identity') {
      setMessage(
        'This Supabase identity is also used by WORDSTRIKE, so deleting the login itself is blocked. You can still delete all Notes cloud data below without affecting WORDSTRIKE.',
      );
    } else {
      setMessage('The account identity could not be deleted.');
    }
    return result;
  }, [accessGranted, clearSessionState, session]);

  const signOut = useCallback(async () => {
    const current = session;
    clearSessionState('Cloud sync is off. Notes remain stored on this device.');
    if (current) {
      try {
        await signOutSession(current);
      } catch {
        // Local sign-out already completed; remote token expiry/revocation can happen independently.
      }
    }
  }, [clearSessionState, session]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      email: session?.user.email ?? null,
      pendingEmail,
      accessGranted,
      recoveryMode,
      lastSyncedAt,
      message,
      lastResult,
      sessions,
      signIn,
      signUp,
      claimAccess,
      requestPasswordReset,
      resendVerification,
      changeEmail,
      resendEmailChange,
      requestReauthentication,
      changePassword,
      refreshSessions,
      signOutOtherDevices,
      signOutAllDevices,
      deleteCloudData,
      deleteAccount,
      signOut,
      syncNow,
    }),
    [
      accessGranted,
      changeEmail,
      changePassword,
      claimAccess,
      deleteAccount,
      deleteCloudData,
      lastResult,
      lastSyncedAt,
      message,
      pendingEmail,
      recoveryMode,
      refreshSessions,
      requestPasswordReset,
      requestReauthentication,
      resendEmailChange,
      resendVerification,
      session?.user.email,
      sessions,
      signIn,
      signOut,
      signOutAllDevices,
      signOutOtherDevices,
      signUp,
      status,
      syncNow,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
