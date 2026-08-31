import { z } from 'zod';

import type { ChecklistDraftItem } from '../../db';

const CHECKLIST_CAPTURE_KEY = 'notes.checklist-capture.v1';
const CHECKLIST_EDITOR_KEY = 'notes.checklist-editor.v1';

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

export interface ChecklistJournal {
  noteId: string | null;
  title: string;
  items: ChecklistDraftItem[];
}

export function readChecklistCaptureJournal(): ChecklistJournal | null {
  return readJournal(CHECKLIST_CAPTURE_KEY);
}

export function writeChecklistCaptureJournal(journal: ChecklistJournal): void {
  writeJournal(CHECKLIST_CAPTURE_KEY, journal);
}

export function clearChecklistCaptureJournal(): void {
  clearJournal(CHECKLIST_CAPTURE_KEY);
}

export function readChecklistEditorJournal(): ChecklistJournal | null {
  return readJournal(CHECKLIST_EDITOR_KEY);
}

export function writeChecklistEditorJournal(journal: ChecklistJournal): void {
  writeJournal(CHECKLIST_EDITOR_KEY, journal);
}

export function clearChecklistEditorJournal(): void {
  clearJournal(CHECKLIST_EDITOR_KEY);
}

function readJournal(key: string): ChecklistJournal | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = checklistJournalSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeJournal(key: string, journal: ChecklistJournal): void {
  if (typeof window === 'undefined') return;
  try {
    const parsed = checklistJournalSchema.parse(journal);
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // IndexedDB remains the durable store; journaling is best-effort crash protection.
  }
}

function clearJournal(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors during cleanup.
  }
}
