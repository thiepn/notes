import type { NoteRecord } from '../../db';

export type NoteSort = 'updated' | 'created' | 'title';
export const NOTE_SORT_KEY = 'notes.sort.v1';
export function readNoteSort(): NoteSort {
  try {
    const value = localStorage.getItem(NOTE_SORT_KEY);
    return value === 'created' || value === 'title' ? value : 'updated';
  } catch {
    return 'updated';
  }
}
export function sortDocuments(notes: NoteRecord[], sort: NoteSort): NoteRecord[] {
  return [...notes].sort((a, b) => {
    if (sort === 'title')
      return (
        (a.title || a.content || 'Untitled').localeCompare(
          b.title || b.content || 'Untitled',
          undefined,
          { numeric: true, sensitivity: 'base' },
        ) || a.id.localeCompare(b.id)
      );
    return (
      (sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt) ||
      a.id.localeCompare(b.id)
    );
  });
}
