import { describe, expect, it } from 'vitest';

import {
  EDITOR_JOURNAL_KEY,
  clearEditorJournal,
  readEditorJournal,
  writeEditorJournal,
  type EditorStorage,
} from './editorJournal';

class MemoryStorage implements EditorStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('editor journal', () => {
  it('round-trips an existing-note edit', () => {
    const storage = new MemoryStorage();
    const noteId = '1adfe7cb-af93-4e6b-94cf-a574e2f2ae99';

    expect(
      writeEditorJournal({ noteId, title: 'Edited', content: 'Recovered body' }, storage),
    ).toBe(true);
    expect(readEditorJournal(storage)).toMatchObject({
      version: 1,
      noteId,
      title: 'Edited',
      content: 'Recovered body',
    });
  });

  it('rejects malformed entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(EDITOR_JOURNAL_KEY, JSON.stringify({ version: 1, noteId: 'not-a-uuid' }));

    expect(readEditorJournal(storage)).toBeNull();
  });

  it('clears the edit after a durable write', () => {
    const storage = new MemoryStorage();
    writeEditorJournal(
      {
        noteId: '1adfe7cb-af93-4e6b-94cf-a574e2f2ae99',
        title: '',
        content: 'Draft',
      },
      storage,
    );

    expect(clearEditorJournal(storage)).toBe(true);
    expect(readEditorJournal(storage)).toBeNull();
  });
});
