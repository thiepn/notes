export const NOTES_VIEW_MODE_KEY = 'notes.view-mode';

export type NotesViewMode = 'grid' | 'list';

export interface ViewModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readNotesViewMode(storage: ViewModeStorage | null = browserStorage()): NotesViewMode {
  if (!storage) return 'grid';

  try {
    return storage.getItem(NOTES_VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function writeNotesViewMode(
  mode: NotesViewMode,
  storage: ViewModeStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(NOTES_VIEW_MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

function browserStorage(): ViewModeStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
