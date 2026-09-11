export const APP_EVENTS = {
  cloudSyncApplied: 'notes-cloud-sync-applied',
  remindersChanged: 'notes-reminders-changed',
  openSyncSettings: 'notes-open-sync-settings',
  searchHistoryChanged: 'notes-search-history-changed',
} as const;

export type AppEventName = keyof typeof APP_EVENTS;

const CROSS_TAB_CHANNEL = 'thiepn-notes-events-v1';
const CROSS_TAB_EVENTS = new Set<AppEventName>([
  'cloudSyncApplied',
  'remindersChanged',
  'searchHistoryChanged',
]);
let channel: BroadcastChannel | null = null;

export function dispatchAppEvent(name: AppEventName): void {
  dispatchLocal(name);
  broadcastAppEvent(name);
}

export function broadcastAppEvent(name: AppEventName): void {
  if (!CROSS_TAB_EVENTS.has(name)) return;
  getChannel()?.postMessage(name);
}

export function subscribeAppEvent(name: AppEventName, listener: () => void): () => void {
  const eventName = APP_EVENTS[name];
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}

function dispatchLocal(name: AppEventName): void {
  window.dispatchEvent(new Event(APP_EVENTS[name]));
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return null;
  if (channel) return channel;
  channel = new window.BroadcastChannel(CROSS_TAB_CHANNEL);
  channel.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'string' || !isAppEventName(event.data)) return;
    if (!CROSS_TAB_EVENTS.has(event.data)) return;
    dispatchLocal(event.data);
  });
  return channel;
}

function isAppEventName(value: string): value is AppEventName {
  return value in APP_EVENTS;
}
