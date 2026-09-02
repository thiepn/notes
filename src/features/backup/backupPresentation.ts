import type { BackupDocument, BackupStats } from './backupFormat';

export const LAST_MANUAL_BACKUP_KEY = 'notes.backup.last-manual.v1';

export interface LastManualBackup {
  exportedAt: number;
  filename: string;
  fileBytes: number;
}

export interface BackupComparisonRow {
  key: 'notes' | 'attachments' | 'reminders' | 'revisions' | 'totalRecords';
  label: string;
  current: number;
  incoming: number;
  delta: number;
}

export function readLastManualBackup(): LastManualBackup | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_MANUAL_BACKUP_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LastManualBackup>;
    if (
      typeof value.exportedAt !== 'number' ||
      !Number.isFinite(value.exportedAt) ||
      value.exportedAt < 0 ||
      typeof value.filename !== 'string' ||
      !value.filename ||
      typeof value.fileBytes !== 'number' ||
      !Number.isFinite(value.fileBytes) ||
      value.fileBytes < 0
    ) {
      return null;
    }
    return {
      exportedAt: value.exportedAt,
      filename: value.filename,
      fileBytes: value.fileBytes,
    };
  } catch {
    return null;
  }
}

export function writeLastManualBackup(value: LastManualBackup): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(LAST_MANUAL_BACKUP_KEY, JSON.stringify(value));
}

export function formatBackupBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

export function formatBackupAge(timestamp: number, now = Date.now()): string {
  const difference = now - timestamp;
  if (difference < -5 * 60_000) return 'Timestamp is ahead of this device';
  if (difference <= 60_000) return 'Just now';

  const minutes = Math.floor(difference / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function backupVersionLabel(document: BackupDocument): string {
  return `Backup v${document.formatVersion} · Database v${document.databaseVersion}`;
}

export function backupComparisonRows(
  current: BackupStats,
  incoming: BackupStats,
): BackupComparisonRow[] {
  const definitions: Array<[BackupComparisonRow['key'], string]> = [
    ['notes', 'Notes'],
    ['attachments', 'Attachments'],
    ['reminders', 'Reminders'],
    ['revisions', 'Saved versions'],
    ['totalRecords', 'All database records'],
  ];
  return definitions.map(([key, label]) => ({
    key,
    label,
    current: current[key],
    incoming: incoming[key],
    delta: incoming[key] - current[key],
  }));
}

export function formatBackupDelta(delta: number): string {
  if (delta === 0) return 'Same';
  return delta > 0 ? `+${delta}` : String(delta);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
