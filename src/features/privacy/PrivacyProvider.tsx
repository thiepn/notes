import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PrivacyContext, type PrivacyContextValue } from './PrivacyContext';
import {
  clearPrivacyCredential,
  createPrivacyCredential,
  normalizePrivacyPreferences,
  privacyAutoLockDelayMs,
  PRIVACY_CREDENTIAL_KEY,
  PRIVACY_PREFERENCES_KEY,
  readPrivacyCredential,
  readPrivacyPreferences,
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
  const hiddenAtRef = useRef<number | null>(null);
  const autoLockTimerRef = useRef<number | null>(null);

  const clearAutoLockTimer = useCallback(() => {
    if (autoLockTimerRef.current === null) return;
    window.clearTimeout(autoLockTimerRef.current);
    autoLockTimerRef.current = null;
  }, []);

  const lock = useCallback(() => {
    if (!credential) return;
    setLocked(true);
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
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
        lock();
        return;
      }
      const hiddenAt = hiddenAtRef.current ?? Date.now();
      hiddenAtRef.current = hiddenAt;
      const remaining = Math.max(0, delay - (Date.now() - hiddenAt));
      autoLockTimerRef.current = window.setTimeout(lock, remaining);
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
      if (delay !== null && Date.now() - hiddenAt >= delay) lock();
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
  }, [clearAutoLockTimer, credential, lock, preferences.autoLockMinutes]);

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
    setCredential(nextCredential);
  }, []);

  const changePasscode = useCallback(
    async (currentPasscode: string, nextPasscode: string) => {
      if (!credential || !(await verifyPrivacyPasscode(currentPasscode, credential))) return false;
      const nextCredential = await createPrivacyCredential(nextPasscode);
      writePrivacyCredential(nextCredential);
      setCredential(nextCredential);
      return true;
    },
    [credential],
  );

  const disableLock = useCallback(
    async (passcode: string) => {
      if (!credential || !(await verifyPrivacyPasscode(passcode, credential))) return false;
      clearPrivacyCredential();
      setCredential(null);
      setLocked(false);
      return true;
    },
    [credential],
  );

  const unlock = useCallback(
    async (passcode: string) => {
      if (!credential) {
        setLocked(false);
        return true;
      }
      const valid = await verifyPrivacyPasscode(passcode, credential);
      if (valid) setLocked(false);
      return valid;
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
    ],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
