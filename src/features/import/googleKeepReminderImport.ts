import { strFromU8, unzipSync } from 'fflate';

import type { KeepImportStats, PreparedKeepImport, PreparedKeepNote } from './googleKeepImport';

export interface PreparedKeepNoteWithReminder extends PreparedKeepNote {
  reminderAt: number | null;
}

export interface PreparedKeepImportWithReminders extends Omit<PreparedKeepImport, 'notes' | 'stats'> {
  notes: PreparedKeepNoteWithReminder[];
  stats: KeepImportStats & { reminders: number };
}

export async function augmentGoogleKeepReminders(
  files: File[],
  prepared: PreparedKeepImport,
): Promise<PreparedKeepImportWithReminders> {
  const jsonByPath = await readKeepJsonByUniquePath(files);
  let reminderCount = 0;
  let extraWarningCount = 0;
  const extraWarnings: PreparedKeepImport['warnings'] = [];

  const notes = prepared.notes.map((note) => {
    const raw = jsonByPath.get(note.sourcePath.toLocaleLowerCase());
    if (!raw) return { ...note, reminderAt: null };

    const extracted = extractReminderTimestamp(raw);
    if (extracted.kind === 'recognized') {
      reminderCount += 1;
      return { ...note, reminderAt: extracted.timestamp };
    }
    if (extracted.kind === 'unrecognized') {
      extraWarningCount += 1;
      if (prepared.warnings.length + extraWarnings.length < 50) {
        extraWarnings.push({
          source: note.sourcePath,
          message:
            'Google Keep reminder metadata was present but its timestamp shape was not recognized, so no reminder was guessed.',
        });
      }
    }
    return { ...note, reminderAt: null };
  });

  return {
    ...prepared,
    notes,
    warnings: [...prepared.warnings, ...extraWarnings],
    stats: {
      ...prepared.stats,
      reminders: reminderCount,
      warningCount: prepared.stats.warningCount + extraWarningCount,
    },
  };
}

type ReminderExtraction =
  | { kind: 'none' }
  | { kind: 'unrecognized' }
  | { kind: 'recognized'; timestamp: number };

function extractReminderTimestamp(raw: unknown): ReminderExtraction {
  if (!isRecord(raw)) return { kind: 'none' };

  const topLevelCandidates: Array<[string, unknown]> = [
    ['reminderTimestampUsec', raw.reminderTimestampUsec],
    ['reminderTimeUsec', raw.reminderTimeUsec],
  ];
  for (const [key, value] of topLevelCandidates) {
    const timestamp = parseTimestampValue(value, key);
    if (timestamp !== null) return { kind: 'recognized', timestamp };
  }

  const reminderPayloads = [raw.reminder, raw.reminders].filter((value) => value !== undefined);
  if (reminderPayloads.length === 0) return { kind: 'none' };

  const timestamps: number[] = [];
  for (const payload of reminderPayloads) collectReminderTimestamps(payload, timestamps, 0);
  if (timestamps.length === 0) return { kind: 'unrecognized' };
  return { kind: 'recognized', timestamp: Math.min(...timestamps) };
}

const REMINDER_TIME_KEYS = new Set([
  'timestampUsec',
  'timeUsec',
  'eventTimeUsec',
  'triggerTimeUsec',
  'reminderTimestampUsec',
  'reminderTimeUsec',
  'dueAt',
  'eventTime',
  'triggerTime',
  'timestamp',
  'time',
]);

function collectReminderTimestamps(value: unknown, result: number[], depth: number): void {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectReminderTimestamps(item, result, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, candidate] of Object.entries(value)) {
    if (REMINDER_TIME_KEYS.has(key)) {
      const timestamp = parseTimestampValue(candidate, key);
      if (timestamp !== null) result.push(timestamp);
    }
    if (candidate && (Array.isArray(candidate) || isRecord(candidate))) {
      collectReminderTimestamps(candidate, result, depth + 1);
    }
  }
}

function parseTimestampValue(value: unknown, key: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !/^\d+$/u.test(value.trim())) {
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) return null;

  let milliseconds: number;
  if (/usec$/iu.test(key) || numeric >= 100_000_000_000_000) milliseconds = Math.floor(numeric / 1000);
  else if (numeric >= 100_000_000_000) milliseconds = numeric;
  else if (numeric >= 1_000_000_000) milliseconds = numeric * 1000;
  else return null;

  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

async function readKeepJsonByUniquePath(files: File[]): Promise<Map<string, unknown>> {
  const values = new Map<string, unknown>();
  const ambiguous = new Set<string>();

  for (const file of files) {
    if (file.name.toLocaleLowerCase().endsWith('.zip')) {
      let entries: ReturnType<typeof unzipSync>;
      try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (entry) => entry.originalSize <= 100 * 1024 * 1024,
        });
      } catch {
        continue;
      }
      for (const [rawPath, bytes] of Object.entries(entries)) {
        if (!rawPath.toLocaleLowerCase().endsWith('.json')) continue;
        registerJson(values, ambiguous, rawPath, bytes);
      }
      continue;
    }

    if (!file.name.toLocaleLowerCase().endsWith('.json')) continue;
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const path = relativePath?.trim() || file.name;
    registerJson(values, ambiguous, path, new Uint8Array(await file.arrayBuffer()));
  }

  for (const path of ambiguous) values.delete(path);
  return values;
}

function registerJson(
  values: Map<string, unknown>,
  ambiguous: Set<string>,
  rawPath: string,
  bytes: Uint8Array,
): void {
  const path = normalizePath(rawPath);
  if (!path) return;
  const key = path.toLocaleLowerCase();
  if (values.has(key)) {
    ambiguous.add(key);
    return;
  }
  try {
    values.set(key, JSON.parse(strFromU8(bytes)) as unknown);
  } catch {
    // The main importer owns malformed JSON warnings.
  }
}

function normalizePath(value: string): string | null {
  const normalized = value
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '')
    .replace(/^\/+|\/+$/gu, '');
  if (!normalized) return null;
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) return null;
  return segments.filter((segment) => segment !== '.').join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
