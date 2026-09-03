import { describe, expect, it } from 'vitest';

import type { BackupDocument, BackupStats } from './backupFormat';
import {
  backupComparisonRows,
  backupVersionLabel,
  formatBackupAge,
  formatBackupBytes,
  formatBackupCount,
  formatBackupDelta,
} from './backupPresentation';

function stats(overrides: Partial<BackupStats> = {}): BackupStats {
  return {
    notes: 2,
    checklistItems: 3,
    labels: 1,
    noteLabels: 1,
    attachments: 1,
    reminders: 1,
    revisions: 2,
    settings: 1,
    totalRecords: 12,
    ...overrides,
  };
}

describe('backup recovery presentation helpers', () => {
  it('formats file sizes, counts, and backup age clearly', () => {
    expect(formatBackupBytes(0)).toBe('0 B');
    expect(formatBackupBytes(1024)).toBe('1.00 KB');
    expect(formatBackupBytes(12 * 1024)).toBe('12.0 KB');
    expect(formatBackupCount(1, 'attachment')).toBe('1 attachment');
    expect(formatBackupCount(2, 'attachment')).toBe('2 attachments');
    expect(formatBackupCount(0, 'saved version', 'saved versions')).toBe('0 saved versions');

    const now = new Date(2026, 8, 2, 10, 0, 0, 0).getTime();
    expect(formatBackupAge(now - 20_000, now)).toBe('Just now');
    expect(formatBackupAge(now - 17 * 60_000, now)).toBe('17 min ago');
    expect(formatBackupAge(now - 2 * 60 * 60_000, now)).toBe('2 hours ago');
    expect(formatBackupAge(now - 2 * 24 * 60 * 60_000, now)).toBe('2 days ago');
    expect(formatBackupAge(now + 10 * 60_000, now)).toBe('Timestamp is ahead of this device');
  });

  it('labels normalized backup/database versions', () => {
    expect(backupVersionLabel({ formatVersion: 2, databaseVersion: 3 } as BackupDocument)).toBe(
      'Backup v2 · Database v3',
    );
  });

  it('compares current and incoming recovery counts with useful deltas', () => {
    const rows = backupComparisonRows(
      stats({ notes: 5, attachments: 2, reminders: 1, revisions: 7, totalRecords: 24 }),
      stats({ notes: 3, attachments: 4, reminders: 1, revisions: 9, totalRecords: 28 }),
    );
    expect(rows).toEqual([
      { key: 'notes', label: 'Notes', current: 5, incoming: 3, delta: -2 },
      { key: 'attachments', label: 'Attachments', current: 2, incoming: 4, delta: 2 },
      { key: 'reminders', label: 'Reminders', current: 1, incoming: 1, delta: 0 },
      { key: 'revisions', label: 'Saved versions', current: 7, incoming: 9, delta: 2 },
      { key: 'totalRecords', label: 'All database records', current: 24, incoming: 28, delta: 4 },
    ]);
    expect(formatBackupDelta(-2)).toBe('-2');
    expect(formatBackupDelta(0)).toBe('Same');
    expect(formatBackupDelta(4)).toBe('+4');
  });
});
