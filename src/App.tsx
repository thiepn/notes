import { Suspense, lazy, useCallback, useEffect, useState } from 'react';

import { AppShell } from './app/AppShell';
import { LaunchIntentCoordinator } from './app/LaunchIntentCoordinator';
import { PwaStatus } from './app/PwaStatus';
import { FirstRunCoach } from './features/onboarding/FirstRunCoach';
import { PrivacyGate } from './features/privacy/PrivacyGate';
import { PrivacyProvider } from './features/privacy/PrivacyProvider';
import { ReminderNotificationCoordinator } from './features/reminders/ReminderNotificationCoordinator';
import { SyncContext, type SyncContextValue, useSync } from './features/sync/SyncContext';
import { ThemeProvider } from './theme/ThemeProvider';

const SyncProvider = lazy(() =>
  import('./features/sync/SyncProvider').then((module) => ({ default: module.SyncProvider })),
);

const syncUnavailable = () => Promise.reject(new Error('Cloud sync is still loading.'));
const INITIAL_SYNC_VALUE: SyncContextValue = {
  status: 'connecting',
  email: null,
  pendingEmail: null,
  accessGranted: false,
  recoveryMode: false,
  lastSyncedAt: null,
  message: null,
  lastResult: null,
  sessions: [],
  signIn: syncUnavailable,
  signUp: syncUnavailable,
  claimAccess: syncUnavailable,
  requestPasswordReset: syncUnavailable,
  resendVerification: syncUnavailable,
  changeEmail: syncUnavailable,
  resendEmailChange: syncUnavailable,
  requestReauthentication: syncUnavailable,
  changePassword: syncUnavailable,
  refreshSessions: syncUnavailable,
  signOutOtherDevices: syncUnavailable,
  signOutAllDevices: syncUnavailable,
  deleteCloudData: syncUnavailable,
  deleteAccount: syncUnavailable,
  signOut: syncUnavailable,
  syncNow: syncUnavailable,
};

function SyncBridge({ onValue }: { onValue(value: SyncContextValue): void }) {
  const value = useSync();
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

function SyncedWorkspace() {
  return (
    <PrivacyGate>
      <AppShell />
      <LaunchIntentCoordinator />
      <FirstRunCoach />
      <PwaStatus />
    </PrivacyGate>
  );
}

function NotesRuntime() {
  return (
    <>
      <SyncedWorkspace />
      <ReminderNotificationCoordinator />
    </>
  );
}

export function App() {
  const [syncValue, setSyncValue] = useState<SyncContextValue>(INITIAL_SYNC_VALUE);
  const handleSyncValue = useCallback((value: SyncContextValue) => setSyncValue(value), []);
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SyncContext.Provider value={syncValue}>
          <NotesRuntime />
        </SyncContext.Provider>
        <Suspense fallback={null}>
          <SyncProvider>
            <SyncBridge onValue={handleSyncValue} />
          </SyncProvider>
        </Suspense>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
