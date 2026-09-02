import { createContext, useContext } from 'react';

import type { PrivacyPreferences } from './privacy';

export interface PrivacyContextValue {
  preferences: PrivacyPreferences;
  hidePreviews: boolean;
  privateNotifications: boolean;
  autoLockMinutes: number | null;
  lockEnabled: boolean;
  locked: boolean;
  setPreferences(next: Partial<PrivacyPreferences>): void;
  enableLock(passcode: string): Promise<void>;
  changePasscode(currentPasscode: string, nextPasscode: string): Promise<boolean>;
  disableLock(passcode: string): Promise<boolean>;
  lock(): void;
  unlock(passcode: string): Promise<boolean>;
}

export const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);
  if (!context) throw new Error('usePrivacy must be used within PrivacyProvider.');
  return context;
}
