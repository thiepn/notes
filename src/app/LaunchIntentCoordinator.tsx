import { useEffect } from 'react';

import { notesDatabase } from '../db';
import { requestLinkedNoteOpen } from '../features/links/navigation';
import {
  SharedCaptureRepository,
  SharedCaptureValidationError,
  deleteStagedShare,
  deleteStagedShareByKey,
  prepareSharedCapture,
  readStagedShare,
} from '../features/notes/sharedCapture';
import { dispatchAppEvent } from './events';
import {
  clearLaunchIntentFromLocation,
  consumePreparedLaunchIntent,
  type LaunchCapture,
  type LaunchIntent,
} from './launchIntent';

const sharedCaptureRepository = new SharedCaptureRepository(notesDatabase);
const UI_RETRY_ATTEMPTS = 80;
const UI_RETRY_MS = 50;

export function LaunchIntentCoordinator() {
  useEffect(() => {
    const intent = consumePreparedLaunchIntent();
    if (!intent) return;

    void handleLaunchIntent(intent).then((safeToClear) => {
      if (safeToClear) clearLaunchIntentFromLocation();
    });
  }, []);

  return null;
}

async function handleLaunchIntent(intent: LaunchIntent): Promise<boolean> {
  if (intent.shareKey) return consumeSharedNote(intent.shareKey);

  if (intent.noteId) {
    await requestLinkedNoteOpen(intent.noteId);
    return true;
  }

  if (intent.capture) {
    await openCapture(intent.capture);
    return true;
  }

  if (intent.view === 'search' || intent.searchQuery) {
    await openSearch(intent.searchQuery ?? '');
    return true;
  }

  return true;
}

async function consumeSharedNote(shareKey: string): Promise<boolean> {
  try {
    const consumed = await sharedCaptureRepository.lookup(shareKey);
    if (consumed) {
      await bestEffortDeleteStagedShare(shareKey);
      if (consumed.note) {
        dispatchAppEvent('cloudSyncApplied');
        await requestLinkedNoteOpen(consumed.note.id);
      }
      return true;
    }

    const staged = await readStagedShare(shareKey);
    if (!staged) return true;

    let capture;
    try {
      capture = await prepareSharedCapture(staged);
    } catch (error) {
      if (!(error instanceof SharedCaptureValidationError)) throw error;
      console.warn('A shared payload was rejected by local attachment validation.', error);
      await deleteStagedShare(staged).catch(() => undefined);
      return true;
    }

    if (!capture) {
      await deleteStagedShare(staged).catch(() => undefined);
      return true;
    }

    const committed = await sharedCaptureRepository.commit(shareKey, capture);
    await deleteStagedShare(staged).catch(() => undefined);
    if (committed.note) {
      dispatchAppEvent('cloudSyncApplied');
      await requestLinkedNoteOpen(committed.note.id);
    }
    return true;
  } catch {
    // Before the exact-once transaction commits, keep the share token intact so a reload can retry.
    return false;
  }
}

async function bestEffortDeleteStagedShare(shareKey: string): Promise<void> {
  try {
    await deleteStagedShareByKey(shareKey);
  } catch {
    // The exact-once ledger is already authoritative; leftover Cache Storage is harmless and bounded.
  }
}

async function openCapture(capture: LaunchCapture): Promise<void> {
  const selector =
    capture === 'checklist'
      ? 'button[aria-label="Create a checklist"]'
      : 'button[aria-label="Create a text note"]';
  const button = await findElement<HTMLButtonElement>(selector);
  button?.click();
}

async function openSearch(query: string): Promise<void> {
  const searchDestination = await findElement<HTMLButtonElement>(
    '.mobile-navigation button[aria-label="Find a note"]',
  );
  searchDestination?.click();

  const input = await findElement<HTMLInputElement>('input[aria-label="Search notes"]');
  if (!input) return;
  input.focus({ preventScroll: true });
  if (!query) return;

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, query);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function findElement<T extends Element>(selector: string): Promise<T | null> {
  for (let attempt = 0; attempt < UI_RETRY_ATTEMPTS; attempt += 1) {
    const element = document.querySelector<T>(selector);
    if (element) return element;
    await delay(UI_RETRY_MS);
  }
  return null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
