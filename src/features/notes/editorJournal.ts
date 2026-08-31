import { z } from 'zod';

export const EDITOR_JOURNAL_KEY = 'notes.editor-draft.v1';

const editorJournalSchema = z.object({
  version: z.literal(1),
  noteId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  updatedAt: z.number().int().nonnegative(),
});

export type EditorJournal = z.infer<typeof editorJournalSchema>;

export interface EditorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readEditorJournal(
  storage: EditorStorage | null = browserStorage(),
): EditorJournal | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(EDITOR_JOURNAL_KEY);
    if (!raw) return null;

    const parsed = editorJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeEditorJournal(
  entry: Pick<EditorJournal, 'noteId' | 'title' | 'content'>,
  storage: EditorStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;

  try {
    const journal = editorJournalSchema.parse({
      version: 1,
      ...entry,
      updatedAt: Date.now(),
    });
    storage.setItem(EDITOR_JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch {
    return false;
  }
}

export function clearEditorJournal(storage: EditorStorage | null = browserStorage()): boolean {
  if (!storage) return false;

  try {
    storage.removeItem(EDITOR_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

function browserStorage(): EditorStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
