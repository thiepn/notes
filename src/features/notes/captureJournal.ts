import { z } from 'zod';

export const CAPTURE_JOURNAL_KEY = 'notes.capture-draft.v1';

const captureJournalSchema = z.object({
  version: z.literal(1),
  noteId: z.string().uuid().nullable(),
  title: z.string(),
  content: z.string(),
  updatedAt: z.number().int().nonnegative(),
});

export interface CaptureDraft {
  title: string;
  content: string;
}

export type CaptureJournal = z.infer<typeof captureJournalSchema>;

export interface CaptureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isMeaningfulDraft(draft: CaptureDraft): boolean {
  return draft.title.trim().length > 0 || draft.content.trim().length > 0;
}

export function readCaptureJournal(
  storage: CaptureStorage | null = browserStorage(),
): CaptureJournal | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(CAPTURE_JOURNAL_KEY);
    if (!raw) return null;

    const parsed = captureJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeCaptureJournal(
  entry: Omit<CaptureJournal, 'version' | 'updatedAt'>,
  storage: CaptureStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;

  try {
    const journal = captureJournalSchema.parse({
      version: 1,
      ...entry,
      updatedAt: Date.now(),
    });
    storage.setItem(CAPTURE_JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch {
    return false;
  }
}

export function clearCaptureJournal(storage: CaptureStorage | null = browserStorage()): boolean {
  if (!storage) return false;

  try {
    storage.removeItem(CAPTURE_JOURNAL_KEY);
    return true;
  } catch {
    return false;
  }
}

function browserStorage(): CaptureStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
