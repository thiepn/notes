import { AppShell } from './app/AppShell';
import { PwaStatus } from './app/PwaStatus';
import { ThemeProvider } from './theme/ThemeProvider';

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
      <PwaStatus />
    </ThemeProvider>
  );
}
