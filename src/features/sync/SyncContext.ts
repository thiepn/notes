import { createContext, useContext } from 'react';

import type { SyncResult } from './syncEngine';

export type SyncStatus =
  'local' | 'connecting' | 'setup' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncContextValue {
  status: SyncStatus;
  email: string | null;
  accessGranted: boolean;
  lastSyncedAt: number | null;
  message: string | null;
  lastResult: SyncResult | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'>;
  claimAccess(setupCode: string): Promise<boolean>;
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
