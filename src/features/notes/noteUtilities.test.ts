import { describe, expect, it, vi, afterEach } from 'vitest';
import { documentFilename, documentMarkdown } from './noteUtilities';
import { readNoteSort, sortDocuments } from './noteSort';
import type { NoteRecord } from '../../db';

const note = (id: string, title: string, createdAt: number, updatedAt: number): NoteRecord => ({
  id,
  title,
  createdAt,
  updatedAt,
  type: 'text',
  content: '',
  color: 'default',
  pinnedAt: null,
  archivedAt: null,
  trashedAt: null,
  position: 0,
  revision: 1,
});
afterEach(() => vi.unstubAllGlobals());
describe('portable document utilities', () => {
  it('exports the current Markdown without losing formatting or Unicode', () => {
    expect(
      documentMarkdown({ type: 'text', title: 'Français', content: '**Bonjour**\n안녕하세요' }),
    ).toBe('# Français\n\n**Bonjour**\n안녕하세요\n');
  });
  it('exports untitled text without an invented heading', () => {
    expect(documentMarkdown({ type: 'text', title: '', content: 'Keep this' })).toBe('Keep this\n');
  });
  it('exports checklist state and child indentation', () => {
    expect(
      documentMarkdown({ type: 'checklist', title: 'Pack', content: '' }, [
        { id: 'a', text: 'Bag', checked: true, parentId: null },
        { id: 'b', text: 'Pen', checked: false, parentId: 'a' },
      ]),
    ).toBe('# Pack\n\n- [x] Bag\n  - [ ] Pen\n');
  });
  it('terminates on malformed cyclic parent relationships', () => {
    const result = documentMarkdown({ type: 'checklist', title: '', content: '' }, [
      { id: 'a', text: 'A', checked: false, parentId: 'b' },
      { id: 'b', text: 'B', checked: false, parentId: 'a' },
    ]);
    expect(result.length).toBeLessThan(100);
  });
  it('sanitizes reserved file name characters and device names', () => {
    expect(documentFilename('A/B: notes?')).toBe('A-B- notes-.md');
    expect(documentFilename('CON')).toBe('Note-CON.md');
    expect(documentFilename('LPT1.txt')).toBe('Note-LPT1.txt.md');
    expect(documentFilename('  ... ')).toBe('Untitled note.md');
  });
  it('bounds Unicode filenames by bytes and does not cut surrogate pairs', () => {
    const name = documentFilename('안녕🌍'.repeat(100));
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(183);
    expect(name).not.toContain('�');
    expect(name.endsWith('.md')).toBe(true);
  });
  it('sorts by dates or natural alphabetical order without mutating the library', () => {
    const notes = [note('a', 'Note 10', 2, 9), note('b', 'Note 2', 5, 1)];
    expect(sortDocuments(notes, 'title').map((item) => item.id)).toEqual(['b', 'a']);
    expect(sortDocuments(notes, 'created').map((item) => item.id)).toEqual(['b', 'a']);
    expect(sortDocuments(notes, 'updated').map((item) => item.id)).toEqual(['a', 'b']);
    expect(notes[0]?.id).toBe('a');
  });
  it('ignores malformed preferences and remains usable when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'broken' });
    expect(readNoteSort()).toBe('updated');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readNoteSort()).toBe('updated');
  });
});
