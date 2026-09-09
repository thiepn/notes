import { Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { syncStatusLabel, useSync } from './SyncContext';

export function SyncIndicator() {
  const { status, email, lastSyncedAt, message } = useSync();
  const Icon =
    status === 'syncing' || status === 'connecting' ? RefreshCw : email ? Cloud : ShieldCheck;
  const label = syncStatusLabel(status);
  const detail =
    message ??
    (lastSyncedAt
      ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
      : 'Your notes are saved on this device.');
  return (
    <button
      type="button"
      className="sync-indicator"
      data-status={status}
      aria-label={`Account and sync: ${label}`}
      title={detail}
      onClick={() => window.dispatchEvent(new CustomEvent('notes-open-sync-settings'))}
    >
      {status === 'offline' || status === 'error' ? (
        <CloudOff aria-hidden="true" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}
