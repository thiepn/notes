import { describe, expect, it } from 'vitest';

import {
  CAPTURE_JOURNAL_KEY,
  clearCaptureJournal,
  isMeaningfulDraft,
  readCaptureJournal,
  writeCaptureJournal,
  type CaptureStorage,
} from './captureJournal';

class MemoryStorage implements CaptureStorage {
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

describe('capture journal', () => {
  it('round-trips a pending text draft', () => {
    const storage = new MemoryStorage();
    const noteId = '7d9f19ea-80e9-4c9c-9844-099860a44c28';

    expect(
      writeCaptureJournal(
        { noteId, title: 'Title', content: 'Body' },
        storage,
      ),
    ).toBe(true);

    expect(readCaptureJournal(storage)).toMatchObject({
      version: 1,
      noteId,
      title: 'Title',
      content: 'Body',
    });
  });

  it('rejects malformed journal data without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(CAPTURE_JOURNAL_KEY, '{not valid json');

    expect(readCaptureJournal(storage)).toBeNull();
  });

  it('clears the recovery entry after a durable save', () => {
    const storage = new MemoryStorage();
    writeCaptureJournal({ noteId: null, title: '', content: 'Draft' }, storage);

    expect(clearCaptureJournal(storage)).toBe(true);
    expect(readCaptureJournal(storage)).toBeNull();
  });

  it('treats whitespace-only drafts as empty', () => {
    expect(isMeaningfulDraft({ title: '   ', content: '\n\t' })).toBe(false);
    expect(isMeaningfulDraft({ title: '', content: ' useful ' })).toBe(true);
  });
});
