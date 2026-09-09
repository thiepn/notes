import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PrivacyContext, type PrivacyContextValue } from './PrivacyContext';
import {
  broadcastPrivacyLock,
  clearPrivacyCredential,
  clearPrivacyUnlockFailures,
  createPrivacyCredential,
  normalizePrivacyPreferences,
  privacyAutoLockDelayMs,
  privacyCredentialNeedsUpgrade,
  PRIVACY_ATTEMPT_KEY,
  PRIVACY_CREDENTIAL_KEY,
  PRIVACY_LOCK_SIGNAL_KEY,
  PRIVACY_PREFERENCES_KEY,
  readPrivacyAttemptState,
  readPrivacyCredential,
  readPrivacyPreferences,
  registerPrivacyUnlockFailure,
  verifyPrivacyPasscode,
  writePrivacyCredential,
  writePrivacyPreferences,
  type PrivacyCredential,
  type PrivacyPreferences,
} from './privacy';

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<PrivacyPreferences>(readPrivacyPreferences);
  const [credential, setCredential] = useState<PrivacyCredential | null>(readPrivacyCredential);
  const [locked, setLocked] = useState(() => readPrivacyCredential() !== null);
  const [unlockBlockedUntil, setUnlockBlockedUntil] = useState<number | null>(() => {
    const attempt = readPrivacyAttemptState();
    return attempt && attempt.blockedUntil > Date.now() ? attempt.blockedUntil : null;
  });
  const hiddenAtRef = useRef<number | null>(null);
  const autoLockTimerRef = useRef<number | null>(null);

  const clearAutoLockTimer = useCallback(() => {
    if (autoLockTimerRef.current === null) return;
    window.clearTimeout(autoLockTimerRef.current);
    autoLockTimerRef.current = null;
  }, []);

  const lockLocal = useCallback(() => {
    if (!credential) return;
    setLocked(true);
  }, [credential]);

  const lock = useCallback(() => {
    if (!credential) return;
    setLocked(true);
    broadcastPrivacyLock();
  }, [credential]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PRIVACY_PREFERENCES_KEY) {
        setPreferencesState(readPrivacyPreferences());
      }
      if (event.key === PRIVACY_CREDENTIAL_KEY) {
        const nextCredential = readPrivacyCredential();
        setCredential(nextCredential);
        if (!nextCredential) setLocked(false);
        else setLocked(true);
      }
      if (event.key === PRIVACY_ATTEMPT_KEY) {
        const attempt = readPrivacyAttemptState();
        setUnlockBlockedUntil(
          attempt && attempt.blockedUntil > Date.now() ? attempt.blockedUntil : null,
        );
      }
      if (event.key === PRIVACY_LOCK_SIGNAL_KEY && readPrivacyCredential()) {
        setLocked(true);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (unlockBlockedUntil === null) return;
    const remaining = Math.max(0, unlockBlockedUntil - Date.now());
    const timer = window.setTimeout(() => setUnlockBlockedUntil(null), remaining);
    return () => window.clearTimeout(timer);
  }, [unlockBlockedUntil]);

  useEffect(() => {
    if (!credential) {
      hiddenAtRef.current = null;
      clearAutoLockTimer();
      return;
    }

    const scheduleFromHiddenState = () => {
      clearAutoLockTimer();
      if (document.visibilityState !== 'hidden') return;
      const delay = privacyAutoLockDelayMs(preferences.autoLockMinutes);
      if (delay === null) return;
      if (delay === 0) {
        lockLocal();
        return;
      }
      const hiddenAt = hiddenAtRef.current ?? Date.now();
      hiddenAtRef.current = hiddenAt;
      const remaining = Math.max(0, delay - (Date.now() - hiddenAt));
      autoLockTimerRef.current = window.setTimeout(lockLocal, remaining);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        scheduleFromHiddenState();
        return;
      }

      clearAutoLockTimer();
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt === null) return;
      const delay = privacyAutoLockDelayMs(preferences.autoLockMinutes);
      if (delay !== null && Date.now() - hiddenAt >= delay) lockLocal();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    if (document.visibilityState === 'hidden') {
      hiddenAtRef.current = Date.now();
      scheduleFromHiddenState();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearAutoLockTimer();
    };
  }, [clearAutoLockTimer, credential, lockLocal, preferences.autoLockMinutes]);

  const setPreferences = useCallback((next: Partial<PrivacyPreferences>) => {
    setPreferencesState((current) => {
      const merged = normalizePrivacyPreferences({ ...current, ...next });
      writePrivacyPreferences(merged);
      return merged;
    });
  }, []);

  const enableLock = useCallback(async (passcode: string) => {
    const nextCredential = await createPrivacyCredential(passcode);
    writePrivacyCredential(nextCredential);
    clearPrivacyUnlockFailures();
    setUnlockBlockedUntil(null);
    setCredential(nextCredential);
  }, []);

  const changePasscode = useCallback(
    async (currentPasscode: string, nextPasscode: string) => {
      if (!credential || !(await verifyPrivacyPasscode(currentPasscode, credential))) return false;
      const nextCredential = await createPrivacyCredential(nextPasscode);
      writePrivacyCredential(nextCredential);
      clearPrivacyUnlockFailures();
      setUnlockBlockedUntil(null);
      setCredential(nextCredential);
      return true;
    },
    [credential],
  );

  const disableLock = useCallback(
    async (passcode: string) => {
      if (!credential || !(await verifyPrivacyPasscode(passcode, credential))) return false;
      clearPrivacyCredential();
      clearPrivacyUnlockFailures();
      setUnlockBlockedUntil(null);
      setCredential(null);
      setLocked(false);
      return true;
    },
    [credential],
  );

  const unlock = useCallback(
    async (passcode: string) => {
      if (!credential) {
        clearPrivacyUnlockFailures();
        setUnlockBlockedUntil(null);
        setLocked(false);
        return true;
      }

      const now = Date.now();
      const attempt = readPrivacyAttemptState(now);
      if (attempt && attempt.blockedUntil > now) {
        setUnlockBlockedUntil(attempt.blockedUntil);
        return false;
      }

      const valid = await verifyPrivacyPasscode(passcode, credential);
      if (!valid) {
        const nextAttempt = registerPrivacyUnlockFailure();
        setUnlockBlockedUntil(
          nextAttempt.blockedUntil > Date.now() ? nextAttempt.blockedUntil : null,
        );
        return false;
      }

      clearPrivacyUnlockFailures();
      setUnlockBlockedUntil(null);
      if (privacyCredentialNeedsUpgrade(credential)) {
        const upgraded = await createPrivacyCredential(passcode);
        writePrivacyCredential(upgraded);
        setCredential(upgraded);
      }
      setLocked(false);
      return true;
    },
    [credential],
  );

  const value = useMemo<PrivacyContextValue>(
    () => ({
      preferences,
      hidePreviews: preferences.hidePreviews,
      privateNotifications: preferences.privateNotifications,
      autoLockMinutes: preferences.autoLockMinutes,
      lockEnabled: credential !== null,
      locked,
      unlockBlockedUntil,
      setPreferences,
      enableLock,
      changePasscode,
      disableLock,
      lock,
      unlock,
    }),
    [
      changePasscode,
      credential,
      disableLock,
      enableLock,
      lock,
      locked,
      preferences,
      setPreferences,
      unlock,
      unlockBlockedUntil,
    ],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
