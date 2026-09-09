import { dispatchAppEvent } from '../../app/events';
import { NotesRepository, notesDatabase } from '../../db';

const notesRepository = new NotesRepository(notesDatabase);
const OPEN_ATTEMPTS = 60;
const OPEN_RETRY_MS = 50;

export async function requestLinkedNoteOpen(noteId: string): Promise<boolean> {
  if (!noteId) return false;
  const note = await notesRepository.get(noteId);
  if (!note || note.trashedAt !== null) return false;

  const label = note.archivedAt !== null ? 'Archive' : 'Notes';
  const sidebar = document.querySelector<HTMLElement>('[data-testid="app-sidebar"]');
  if (!sidebar) return false;

  if (sidebar.inert) {
    document.querySelector<HTMLButtonElement>('[data-testid="navigation-toggle"]')?.click();
    await nextFrame();
  }

  const navigationButton = [...sidebar.querySelectorAll<HTMLButtonElement>('.nav-item')].find(
    (button) => button.querySelector('.nav-label')?.textContent?.trim() === label,
  );
  navigationButton?.click();

  return openCardWhenAvailable(noteId);
}

export async function requestSavedSearchOpen(searchId: string): Promise<boolean> {
  if (!searchId) return false;

  await nextFrame();
  document.querySelector<HTMLButtonElement>('.search-reset')?.click();
  await nextFrame();

  const openFilterButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Search filters"][aria-expanded="true"]',
  );
  openFilterButton?.click();

  dispatchAppEvent('searchHistoryChanged');
  const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search notes"]');
  if (!searchInput) return false;
  searchInput.focus();

  const selector = `[data-saved-search-id="${CSS.escape(searchId)}"]`;
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) {
      button.click();
      return true;
    }
    if (document.activeElement !== searchInput) searchInput.focus();
    await delay(OPEN_RETRY_MS);
  }
  return false;
}

async function openCardWhenAvailable(noteId: string): Promise<boolean> {
  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    const escapedId = CSS.escape(noteId);
    const card = document.querySelector<HTMLElement>(`[data-note-id="${escapedId}"]`);
    const openButton = card?.querySelector<HTMLButtonElement>('.note-card-open');
    if (openButton) {
      openButton.click();
      return true;
    }
    await delay(OPEN_RETRY_MS);
  }
  return false;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
