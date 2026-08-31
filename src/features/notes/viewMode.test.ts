import { describe, expect, it } from 'vitest';

import {
  NOTES_VIEW_MODE_KEY,
  readNotesViewMode,
  writeNotesViewMode,
  type ViewModeStorage,
} from './viewMode';

class MemoryStorage implements ViewModeStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('notes view mode', () => {
  it('defaults to grid', () => {
    expect(readNotesViewMode(new MemoryStorage())).toBe('grid');
  });

  it('round-trips list mode', () => {
    const storage = new MemoryStorage();

    expect(writeNotesViewMode('list', storage)).toBe(true);
    expect(storage.getItem(NOTES_VIEW_MODE_KEY)).toBe('list');
    expect(readNotesViewMode(storage)).toBe('list');
  });

  it('falls back to grid for unknown persisted values', () => {
    const storage = new MemoryStorage();
    storage.setItem(NOTES_VIEW_MODE_KEY, 'masonry-experimental');

    expect(readNotesViewMode(storage)).toBe('grid');
  });
});
