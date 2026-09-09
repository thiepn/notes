export const APP_EVENTS = {
  cloudSyncApplied: 'notes-cloud-sync-applied',
  remindersChanged: 'notes-reminders-changed',
  openSyncSettings: 'notes-open-sync-settings',
  searchHistoryChanged: 'notes-search-history-changed',
} as const;

export type AppEventName = keyof typeof APP_EVENTS;

export function dispatchAppEvent(name: AppEventName): void {
  window.dispatchEvent(new Event(APP_EVENTS[name]));
}

export function subscribeAppEvent(name: AppEventName, listener: () => void): () => void {
  const eventName = APP_EVENTS[name];
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
