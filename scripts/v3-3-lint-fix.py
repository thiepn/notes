from pathlib import Path

path = Path('src/app/AppShell.tsx')
text = path.read_text()
old = """  useEffect(() => {
    void refreshNavigationStats();
    const handleReminderChanged = () => void refreshNavigationStats();
    window.addEventListener('notes-reminders-changed', handleReminderChanged);
    return () => window.removeEventListener('notes-reminders-changed', handleReminderChanged);
  }, [refreshNavigationStats]);
"""
new = """  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshNavigationStats(), 0);
    const handleReminderChanged = () => void refreshNavigationStats();
    window.addEventListener('notes-reminders-changed', handleReminderChanged);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener('notes-reminders-changed', handleReminderChanged);
    };
  }, [refreshNavigationStats]);
"""
if new not in text:
    if old not in text:
        raise SystemExit('navigation stats effect marker changed')
    text = text.replace(old, new, 1)
path.write_text(text)
