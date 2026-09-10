import { useEffect } from 'react';

import { NotesRepository, notesDatabase } from '../db';
import { requestLinkedNoteOpen } from '../features/links/navigation';
import { dispatchAppEvent } from './events';
import {
  clearLaunchIntentFromLocation,
  consumePreparedLaunchIntent,
  sanitizeSharedPayload,
  sharePayloadPath,
  type LaunchCapture,
  type LaunchIntent,
} from './launchIntent';

const notesRepository = new NotesRepository(notesDatabase);
const SHARE_CACHE = 'notes-share-target-v1';
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
  if (!('caches' in window)) return false;
  const payloadUrl = new URL(sharePayloadPath(shareKey), window.location.origin).toString();

  try {
    const cache = await window.caches.open(SHARE_CACHE);
    const response = await cache.match(payloadUrl);
    if (!response) return true;

    let payload: ReturnType<typeof sanitizeSharedPayload>;
    try {
      payload = sanitizeSharedPayload(await response.json());
    } catch {
      await cache.delete(payloadUrl);
      return true;
    }

    if (!payload) {
      await cache.delete(payloadUrl);
      return true;
    }

    const created = await notesRepository.create({
      title: payload.title,
      content: payload.content,
    });
    dispatchAppEvent('cloudSyncApplied');
    await requestLinkedNoteOpen(created.id);
    await cache.delete(payloadUrl);
    return true;
  } catch {
    // Preserve the token in the URL after transient storage/write failures so reload can retry.
    return false;
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
