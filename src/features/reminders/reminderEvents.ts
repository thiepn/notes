export function dispatchReminderChanged(): void {
  window.dispatchEvent(new CustomEvent('notes-reminders-changed'));
}
