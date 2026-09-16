import { dispatchAppEvent } from '../../app/events';
import { Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { syncStatusLabel, useSync } from './SyncContext';
import { formatSyncActivity } from './syncPresentation';

export function SyncIndicator() {
  const { status, email, lastSyncedAt, message, lastResult } = useSync();
  const Icon =
    status === 'syncing' || status === 'connecting' ? RefreshCw : email ? Cloud : ShieldCheck;
  const label = syncStatusLabel(status);
  const activity = lastResult ? formatSyncActivity(lastResult) : null;
  const detail =
    message ??
    (lastSyncedAt
      ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}${activity ? ` · ${activity}` : ''}`
      : 'Your notes are saved on this device.');
  return (
    <button
      type="button"
      className="sync-indicator"
      data-status={status}
      aria-label={`Account and sync: ${label}. ${detail}`}
      title={detail}
      onClick={() => dispatchAppEvent('openSyncSettings')}
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
