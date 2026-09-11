import { z } from 'zod';

export const EDITOR_JOURNAL_KEY = 'notes.editor-draft.v1';
export const EDITOR_JOURNAL_PREFIX = 'notes.editor-draft.v2:';

const legacyEditorJournalSchema = z.object({
  version: z.literal(1),
  noteId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  updatedAt: z.number().int().nonnegative(),
});

const editorJournalSchema = z.object({
  version: z.literal(2),
  noteId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  updatedAt: z.number().int().nonnegative(),
});

export type EditorJournal = z.infer<typeof editorJournalSchema>;

export interface EditorStorage {
  readonly length?: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
}

export function readEditorJournal(
  noteId?: string,
  storage: EditorStorage | null = browserStorage(),
): EditorJournal | null {
  if (!storage) return null;

  if (noteId) {
    const current = readCurrentJournal(noteId, storage);
    if (current) return current;
    const legacy = readLegacyJournal(storage);
    return legacy?.noteId === noteId ? migrateLegacyJournal(legacy) : null;
  }

  const journals = listCurrentJournals(storage);
  const latest = journals.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (latest) return latest;
  const legacy = readLegacyJournal(storage);
  return legacy ? migrateLegacyJournal(legacy) : null;
}

export function writeEditorJournal(
  entry: Pick<EditorJournal, 'noteId' | 'title' | 'content'>,
  storage: EditorStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;

  try {
    const journal = editorJournalSchema.parse({
      version: 2,
      ...entry,
      updatedAt: Date.now(),
    });
    storage.setItem(journalKey(journal.noteId), JSON.stringify(journal));
    const legacy = readLegacyJournal(storage);
    if (legacy?.noteId === journal.noteId) storage.removeItem(EDITOR_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearEditorJournal(
  noteId?: string,
  storage: EditorStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;

  try {
    if (noteId) {
      storage.removeItem(journalKey(noteId));
      const legacy = readLegacyJournal(storage);
      if (legacy?.noteId === noteId) storage.removeItem(EDITOR_JOURNAL_KEY);
      return true;
    }

    for (const key of listJournalKeys(storage)) storage.removeItem(key);
    storage.removeItem(EDITOR_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

function readCurrentJournal(noteId: string, storage: EditorStorage): EditorJournal | null {
  try {
    const raw = storage.getItem(journalKey(noteId));
    if (!raw) return null;
    const parsed = editorJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readLegacyJournal(storage: EditorStorage): z.infer<typeof legacyEditorJournalSchema> | null {
  try {
    const raw = storage.getItem(EDITOR_JOURNAL_KEY);
    if (!raw) return null;
    const parsed = legacyEditorJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function listCurrentJournals(storage: EditorStorage): EditorJournal[] {
  const journals: EditorJournal[] = [];
  for (const key of listJournalKeys(storage)) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = editorJournalSchema.safeParse(JSON.parse(raw));
      if (parsed.success) journals.push(parsed.data);
    } catch {
      // Ignore a damaged journal while retaining other recoverable drafts.
    }
  }
  return journals;
}

function listJournalKeys(storage: EditorStorage): string[] {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(EDITOR_JOURNAL_PREFIX)) keys.push(key);
  }
  return keys;
}

function migrateLegacyJournal(
  legacy: z.infer<typeof legacyEditorJournalSchema>,
): EditorJournal {
  return editorJournalSchema.parse({ ...legacy, version: 2 });
}

function journalKey(noteId: string): string {
  return `${EDITOR_JOURNAL_PREFIX}${noteId}`;
}

function browserStorage(): EditorStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
