import { describe, expect, it } from 'vitest';

import {
  CHECKLIST_EDITOR_KEY,
  CHECKLIST_EDITOR_PREFIX,
  clearChecklistEditorJournal,
  readChecklistEditorJournal,
  writeChecklistEditorJournal,
  type ChecklistJournalStorage,
} from './checklistJournal';

class MemoryStorage implements ChecklistJournalStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
}

const NOTE_A = '1adfe7cb-af93-4e6b-94cf-a574e2f2ae99';
const NOTE_B = '48ab552a-e358-4207-af3f-dfa677d609e1';
const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';

function journal(noteId: string, itemId: string, title: string) {
  return {
    noteId,
    title,
    items: [{ id: itemId, text: title, checked: false, parentId: null }],
  };
}

describe('checklist editor journal', () => {
  it('keeps two checklist editor drafts independently', () => {
    const storage = new MemoryStorage();
    writeChecklistEditorJournal(journal(NOTE_A, ITEM_A, 'First'), storage);
    writeChecklistEditorJournal(journal(NOTE_B, ITEM_B, 'Second'), storage);

    expect(readChecklistEditorJournal(NOTE_A, storage)?.title).toBe('First');
    expect(readChecklistEditorJournal(NOTE_B, storage)?.title).toBe('Second');
  });

  it('returns the newest checklist draft for startup recovery', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `${CHECKLIST_EDITOR_PREFIX}${NOTE_A}`,
      JSON.stringify({ ...journal(NOTE_A, ITEM_A, 'Older'), version: 2, updatedAt: 10 }),
    );
    storage.setItem(
      `${CHECKLIST_EDITOR_PREFIX}${NOTE_B}`,
      JSON.stringify({ ...journal(NOTE_B, ITEM_B, 'Newer'), version: 2, updatedAt: 20 }),
    );

    expect(readChecklistEditorJournal(undefined, storage)?.noteId).toBe(NOTE_B);
  });

  it('legacy no-argument cleanup removes only the draft last used by this tab', () => {
    const storage = new MemoryStorage();
    writeChecklistEditorJournal(journal(NOTE_A, ITEM_A, 'Peer'), storage);
    writeChecklistEditorJournal(journal(NOTE_B, ITEM_B, 'Current'), storage);

    clearChecklistEditorJournal(undefined, storage);
    expect(readChecklistEditorJournal(NOTE_B, storage)).toBeNull();
    expect(readChecklistEditorJournal(NOTE_A, storage)?.title).toBe('Peer');
  });

  it('reads the legacy single editor slot for backward-compatible recovery', () => {
    const storage = new MemoryStorage();
    storage.setItem(CHECKLIST_EDITOR_KEY, JSON.stringify(journal(NOTE_A, ITEM_A, 'Legacy')));

    expect(readChecklistEditorJournal(NOTE_A, storage)).toMatchObject({
      version: 2,
      noteId: NOTE_A,
      title: 'Legacy',
    });
  });
});
