import { AppShell } from './app/AppShell';
import { PwaStatus } from './app/PwaStatus';
import { PrivacyGate } from './features/privacy/PrivacyGate';
import { PrivacyProvider } from './features/privacy/PrivacyProvider';
import { ReminderNotificationCoordinator } from './features/reminders/ReminderNotificationCoordinator';
import { SyncProvider } from './features/sync/SyncProvider';
import { ThemeProvider } from './theme/ThemeProvider';

export function App() {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <SyncProvider>
          <PrivacyGate>
            <AppShell />
            <PwaStatus />
          </PrivacyGate>
          <ReminderNotificationCoordinator />
        </SyncProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
