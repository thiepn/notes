import { AppShell } from './app/AppShell';
import { PwaStatus } from './app/PwaStatus';
import { ReminderNotificationCoordinator } from './features/reminders/ReminderNotificationCoordinator';
import { ThemeProvider } from './theme/ThemeProvider';

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
      <PwaStatus />
      <ReminderNotificationCoordinator />
    </ThemeProvider>
  );
}
