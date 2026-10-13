import type { BackupDocument, BackupStats } from './backupFormat';
import { backupStats } from './backupFormat';

/**
 * Read-only, private-content-free comparison of TWO original Notes backup
 * documents. Callers must pass documents already validated by BackupRepository,
 * which verifies attachment bytes/checksums and the complete record graph.
 * No secondary writer, progress store, or Account attribution is created.
 */
export const HANDOFF_CATEGORIES = [
  'notes', 'checklistItems', 'labels', 'noteLabels',
  'attachments', 'reminders', 'revisions', 'settings',
] as const;
export type HandoffCategory = (typeof HANDOFF_CATEGORIES)[number];

const CATEGORY_LABELS: Record<HandoffCategory, string> = {
  notes: 'Notes',
  checklistItems: 'Checklist rows',
  labels: 'Labels',
  noteLabels: 'Note-label links',
  attachments: 'Attachments',
  reminders: 'Reminders',
  revisions: 'Saved versions',
  settings: 'Portable settings',
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(
    (key) => JSON.stringify(key) + ':' + stableJson(record[key]),
  ).join(',') + '}';
}

function canonicalRecord(category: HandoffCategory, item: unknown) {
  if (category !== 'attachments') return stableJson(item);
  // The ORIGINAL backup parser already verifies SHA-256 over decoded bytes.
  // Comparing its per-file digest and metadata avoids serializing potentially
  // hundreds of megabytes of base64 a second time.
  const { dataBase64: _ignored, ...record } = item as Record<string, unknown>;
  void _ignored;
  return stableJson(record);
}

async function categoryDigest(document: BackupDocument, category: HandoffCategory) {
  const rows = document.data[category].map((item) => canonicalRecord(category, item)).sort();
  const bytes = new TextEncoder().encode(rows.join('\n'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface HandoffComparison {
  status: 'matched' | 'different';
  categories: { category: HandoffCategory; label: string; source: number; device: number; matched: boolean }[];
  changedLabels: string[];
  sourceRecords: number;
  deviceRecords: number;
  /** A local comparison is never Account authority or independent backup custody. */
  externalCustody: 'NOT_TESTED';
}

export async function compareOriginalNotesBackups(
  source: BackupDocument,
  device: BackupDocument,
): Promise<HandoffComparison> {
  // Document export timestamps are intentionally excluded: they aren't notes.
  const comparisons = await Promise.all(HANDOFF_CATEGORIES.map(async (category) => {
    const [a, b] = await Promise.all([
      categoryDigest(source, category), categoryDigest(device, category),
    ]);
    return { category, label: CATEGORY_LABELS[category],
      source: source.data[category].length, device: device.data[category].length,
      matched: a === b };
  }));
  const sourceStats: BackupStats = backupStats(source);
  const deviceStats: BackupStats = backupStats(device);
  const changedLabels = comparisons.filter((x) => !x.matched).map((x) => x.label);
  return {
    status: changedLabels.length ? 'different' : 'matched',
    categories: comparisons,
    changedLabels, sourceRecords: sourceStats.totalRecords,
    deviceRecords: deviceStats.totalRecords,
    externalCustody: 'NOT_TESTED',
  };
}

export function originalNotesHandoffAdvice(comparison: HandoffComparison) {
  return comparison.status === 'matched'
    ? 'Selected backup and this device have identical validated Notes records and attachment digests at the time of comparison. No restore is necessary for these records. Account cloud state and independent custody remain unverified.'
    : 'Selected backup differs from this device. Review category changes before choosing the existing full-replacement restore. Export and keep a safety copy of this device first. This comparison never merges records or changes the cloud.';
}
