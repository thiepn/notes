import { useEffect, useState } from 'react';

import { AppShell } from './app/AppShell';
import { PwaStatus } from './app/PwaStatus';
import { PrivacyGate } from './features/privacy/PrivacyGate';
import { PrivacyProvider } from './features/privacy/PrivacyProvider';
import { ReminderNotificationCoordinator } from './features/reminders/ReminderNotificationCoordinator';
import { SyncProvider } from './features/sync/SyncProvider';
import { ThemeProvider } from './theme/ThemeProvider';

function SyncedWorkspace() {
  const [libraryVersion, setLibraryVersion] = useState(0);

  useEffect(() => {
    const handleCloudChanges = () => setLibraryVersion((version) => version + 1);
    window.addEventListener('notes-cloud-sync-applied', handleCloudChanges);
    return () => window.removeEventListener('notes-cloud-sync-applied', handleCloudChanges);
  }, []);

  return (
    <PrivacyGate>
      <AppShell key={libraryVersion} />
      <PwaStatus />
    </PrivacyGate>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SyncProvider>
          <SyncedWorkspace />
          <ReminderNotificationCoordinator />
        </SyncProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
