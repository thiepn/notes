import { z } from 'zod';

import { broadcastAppEvent } from '../../app/events';
import type { ChecklistDraftItem } from '../../db';

export const CHECKLIST_CAPTURE_KEY = 'notes.checklist-capture.v1';
export const CHECKLIST_EDITOR_KEY = 'notes.checklist-editor.v1';
export const CHECKLIST_EDITOR_PREFIX = 'notes.checklist-editor.v2:';

const checklistDraftItemSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().max(100_000),
    checked: z.boolean(),
    parentId: z.string().uuid().nullable(),
  })
  .strict();

const checklistJournalSchema = z
  .object({
    noteId: z.string().uuid().nullable(),
    title: z.string().max(500),
    items: z.array(checklistDraftItemSchema).max(10_000),
  })
  .strict();

const checklistEditorJournalSchema = checklistJournalSchema
  .extend({
    noteId: z.string().uuid(),
    version: z.literal(2),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export interface ChecklistJournal {
  noteId: string | null;
  title: string;
  items: ChecklistDraftItem[];
}

export type ChecklistEditorJournal = z.infer<typeof checklistEditorJournalSchema>;

export interface ChecklistJournalStorage {
  readonly length?: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
}

let lastTouchedEditorNoteId: string | null = null;

export function readChecklistCaptureJournal(): ChecklistJournal | null {
  return readJournal(CHECKLIST_CAPTURE_KEY, browserStorage());
}

export function writeChecklistCaptureJournal(journal: ChecklistJournal): void {
  writeJournal(CHECKLIST_CAPTURE_KEY, journal, browserStorage());
}

export function clearChecklistCaptureJournal(): void {
  clearJournal(CHECKLIST_CAPTURE_KEY, browserStorage());
}

export function readChecklistEditorJournal(
  noteId?: string,
  storage: ChecklistJournalStorage | null = browserStorage(),
): ChecklistEditorJournal | null {
  if (!storage) return null;

  if (noteId) {
    const current = readEditorJournal(noteId, storage);
    if (current) {
      lastTouchedEditorNoteId = current.noteId;
      return current;
    }
    const legacy = readJournal(CHECKLIST_EDITOR_KEY, storage);
    if (legacy?.noteId === noteId) {
      const migrated = migrateLegacyEditorJournal(legacy);
      lastTouchedEditorNoteId = migrated.noteId;
      return migrated;
    }
    return null;
  }

  const journals = listEditorJournals(storage);
  const latest = journals.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest) {
    lastTouchedEditorNoteId = latest.noteId;
    return latest;
  }
  const legacy = readJournal(CHECKLIST_EDITOR_KEY, storage);
  if (!legacy?.noteId) return null;
  const migrated = migrateLegacyEditorJournal(legacy);
  lastTouchedEditorNoteId = migrated.noteId;
  return migrated;
}

export function writeChecklistEditorJournal(
  journal: ChecklistJournal,
  storage: ChecklistJournalStorage | null = browserStorage(),
): void {
  if (!storage || !journal.noteId) return;
  try {
    const parsed = checklistEditorJournalSchema.parse({
      ...journal,
      noteId: journal.noteId,
      version: 2,
      updatedAt: Date.now(),
    });
    storage.setItem(editorJournalKey(parsed.noteId), JSON.stringify(parsed));
    lastTouchedEditorNoteId = parsed.noteId;
    const legacy = readJournal(CHECKLIST_EDITOR_KEY, storage);
    if (legacy?.noteId === parsed.noteId) storage.removeItem(CHECKLIST_EDITOR_KEY);
  } catch {
    // IndexedDB remains the durable store; journaling is best-effort crash protection.
  }
}

export function clearChecklistEditorJournal(
  noteId?: string,
  storage: ChecklistJournalStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const targetNoteId = noteId ?? lastTouchedEditorNoteId;
    if (targetNoteId) {
      storage.removeItem(editorJournalKey(targetNoteId));
      const legacy = readJournal(CHECKLIST_EDITOR_KEY, storage);
      if (legacy?.noteId === targetNoteId) storage.removeItem(CHECKLIST_EDITOR_KEY);
      if (lastTouchedEditorNoteId === targetNoteId) lastTouchedEditorNoteId = null;
      broadcastAppEvent('cloudSyncApplied');
      return;
    }

    storage.removeItem(CHECKLIST_EDITOR_KEY);
  } catch {
    // Ignore storage errors during cleanup.
  }
}

function readEditorJournal(
  noteId: string,
  storage: ChecklistJournalStorage,
): ChecklistEditorJournal | null {
  try {
    const raw = storage.getItem(editorJournalKey(noteId));
    if (!raw) return null;
    const parsed = checklistEditorJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function listEditorJournals(storage: ChecklistJournalStorage): ChecklistEditorJournal[] {
  const journals: ChecklistEditorJournal[] = [];
  for (const key of listEditorJournalKeys(storage)) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = checklistEditorJournalSchema.safeParse(JSON.parse(raw));
      if (parsed.success) journals.push(parsed.data);
    } catch {
      // Ignore one damaged journal while retaining other recoverable drafts.
    }
  }
  return journals;
}

function listEditorJournalKeys(storage: ChecklistJournalStorage): string[] {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(CHECKLIST_EDITOR_PREFIX)) keys.push(key);
  }
  return keys;
}

function migrateLegacyEditorJournal(journal: ChecklistJournal): ChecklistEditorJournal {
  if (!journal.noteId) throw new Error('Checklist editor recovery requires a note ID.');
  return checklistEditorJournalSchema.parse({
    ...journal,
    noteId: journal.noteId,
    version: 2,
    updatedAt: 0,
  });
}

function editorJournalKey(noteId: string): string {
  return `${CHECKLIST_EDITOR_PREFIX}${noteId}`;
}

function readJournal(
  key: string,
  storage: ChecklistJournalStorage | null,
): ChecklistJournal | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = checklistJournalSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeJournal(
  key: string,
  journal: ChecklistJournal,
  storage: ChecklistJournalStorage | null,
): void {
  if (!storage) return;
  try {
    const parsed = checklistJournalSchema.parse(journal);
    storage.setItem(key, JSON.stringify(parsed));
  } catch {
    // IndexedDB remains the durable store; journaling is best-effort crash protection.
  }
}

function clearJournal(key: string, storage: ChecklistJournalStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage errors during cleanup.
  }
}

function browserStorage(): ChecklistJournalStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
