import { createContext, useContext } from 'react';

import type { AuthSessionInfo, DeleteAccountResult } from './accountApi';
import type { SyncResult } from './syncEngine';

export type SyncStatus =
  'local' | 'connecting' | 'setup' | 'recovery' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncContextValue {
  status: SyncStatus;
  email: string | null;
  pendingEmail: string | null;
  accessGranted: boolean;
  recoveryMode: boolean;
  lastSyncedAt: number | null;
  message: string | null;
  lastResult: SyncResult | null;
  sessions: AuthSessionInfo[];
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'>;
  claimAccess(setupCode: string): Promise<boolean>;
  requestPasswordReset(email: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  changeEmail(email: string): Promise<void>;
  resendEmailChange(): Promise<void>;
  requestReauthentication(): Promise<void>;
  changePassword(
    password: string,
    options?: { currentPassword?: string; nonce?: string },
  ): Promise<void>;
  refreshSessions(): Promise<void>;
  signOutOtherDevices(): Promise<void>;
  signOutAllDevices(): Promise<void>;
  deleteCloudData(): Promise<void>;
  deleteAccount(): Promise<DeleteAccountResult>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

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
    case 'setup':
      return 'Setup required';
    case 'recovery':
      return 'Password recovery';
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
