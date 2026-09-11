import { describe, expect, it } from 'vitest';

import {
  EDITOR_JOURNAL_KEY,
  EDITOR_JOURNAL_PREFIX,
  clearEditorJournal,
  readEditorJournal,
  writeEditorJournal,
  type EditorStorage,
} from './editorJournal';

class MemoryStorage implements EditorStorage {
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

describe('editor journal', () => {
  it('round-trips an existing-note edit in a per-note journal', () => {
    const storage = new MemoryStorage();

    expect(
      writeEditorJournal({ noteId: NOTE_A, title: 'Edited', content: 'Recovered body' }, storage),
    ).toBe(true);
    expect(readEditorJournal(NOTE_A, storage)).toMatchObject({
      version: 2,
      noteId: NOTE_A,
      title: 'Edited',
      content: 'Recovered body',
    });
  });

  it('keeps recovery drafts for two notes without one overwriting the other', () => {
    const storage = new MemoryStorage();
    writeEditorJournal({ noteId: NOTE_A, title: 'A', content: 'First tab' }, storage);
    writeEditorJournal({ noteId: NOTE_B, title: 'B', content: 'Second tab' }, storage);

    expect(readEditorJournal(NOTE_A, storage)?.content).toBe('First tab');
    expect(readEditorJournal(NOTE_B, storage)?.content).toBe('Second tab');
    expect(storage.length).toBe(2);
  });

  it('returns the newest recoverable journal when no note is specified', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `${EDITOR_JOURNAL_PREFIX}${NOTE_A}`,
      JSON.stringify({ version: 2, noteId: NOTE_A, title: 'A', content: 'Older', updatedAt: 10 }),
    );
    storage.setItem(
      `${EDITOR_JOURNAL_PREFIX}${NOTE_B}`,
      JSON.stringify({ version: 2, noteId: NOTE_B, title: 'B', content: 'Newer', updatedAt: 20 }),
    );

    expect(readEditorJournal(undefined, storage)?.noteId).toBe(NOTE_B);
  });

  it('clears only the durable note while preserving another tab recovery draft', () => {
    const storage = new MemoryStorage();
    writeEditorJournal({ noteId: NOTE_A, title: 'A', content: 'Saved' }, storage);
    writeEditorJournal({ noteId: NOTE_B, title: 'B', content: 'Still pending' }, storage);

    expect(clearEditorJournal(NOTE_A, storage)).toBe(true);
    expect(readEditorJournal(NOTE_A, storage)).toBeNull();
    expect(readEditorJournal(NOTE_B, storage)?.content).toBe('Still pending');
  });

  it('reads a matching legacy v1 journal without losing recovery compatibility', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      EDITOR_JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        noteId: NOTE_A,
        title: 'Legacy',
        content: 'Recovered legacy body',
        updatedAt: 15,
      }),
    );

    expect(readEditorJournal(NOTE_A, storage)).toMatchObject({
      version: 2,
      noteId: NOTE_A,
      title: 'Legacy',
      content: 'Recovered legacy body',
    });
  });

  it('ignores one malformed per-note entry while retaining another valid draft', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${EDITOR_JOURNAL_PREFIX}${NOTE_A}`, '{broken');
    storage.setItem(
      `${EDITOR_JOURNAL_PREFIX}${NOTE_B}`,
      JSON.stringify({ version: 2, noteId: NOTE_B, title: 'Good', content: 'Safe', updatedAt: 2 }),
    );

    expect(readEditorJournal(NOTE_A, storage)).toBeNull();
    expect(readEditorJournal(undefined, storage)?.noteId).toBe(NOTE_B);
  });

  it('clears every text recovery journal when an explicit full cleanup is requested', () => {
    const storage = new MemoryStorage();
    writeEditorJournal({ noteId: NOTE_A, title: 'A', content: 'One' }, storage);
    writeEditorJournal({ noteId: NOTE_B, title: 'B', content: 'Two' }, storage);

    expect(clearEditorJournal(undefined, storage)).toBe(true);
    expect(readEditorJournal(undefined, storage)).toBeNull();
  });
});
