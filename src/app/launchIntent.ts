const ACTIVE_SECTION_KEY = 'notes.active-section';
const ACTIVE_LABEL_KEY = 'notes.active-label';
const MAX_SEARCH_QUERY = 1_000;
const MAX_SHARE_TITLE = 500;
const MAX_SHARE_CONTENT = 1_000_000;
const MAX_SHARE_URL = 16_384;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type LaunchView = 'notes' | 'search' | 'reminders' | 'archive' | 'trash' | 'backup';
export type LaunchCapture = 'text' | 'checklist';

export interface SharedNoteIntent {
  title: string;
  content: string;
}

export interface LaunchIntent {
  view?: LaunchView;
  labelId?: string;
  noteId?: string;
  capture?: LaunchCapture;
  searchQuery?: string;
  sharedNote?: SharedNoteIntent;
}

let preparedLaunchIntent: LaunchIntent | null = null;

export function prepareLaunchIntent(locationUrl?: URL): LaunchIntent | null {
  if (typeof window === 'undefined' && !locationUrl) return null;
  const url = locationUrl ?? new URL(window.location.href);
  const intent = parseLaunchIntent(url);
  preparedLaunchIntent = intent;

  if (intent && typeof window !== 'undefined') primeNavigation(intent, window.localStorage);
  return intent;
}

export function consumePreparedLaunchIntent(): LaunchIntent | null {
  const intent = preparedLaunchIntent;
  preparedLaunchIntent = null;
  return intent;
}

export function parseLaunchIntent(url: URL): LaunchIntent | null {
  const view = parseView(url.searchParams.get('view'));
  const capture = parseCapture(url.searchParams.get('capture'));
  const noteId = parseUuid(url.searchParams.get('note'));
  const labelId = parseUuid(url.searchParams.get('label'));
  const searchQuery = sanitize(url.searchParams.get('q'), MAX_SEARCH_QUERY);
  const sharedNote = parseSharedNoteHash(url.hash);

  if (!view && !capture && !noteId && !labelId && !searchQuery && !sharedNote) return null;

  return {
    ...(view ? { view } : {}),
    ...(capture ? { capture } : {}),
    ...(noteId ? { noteId } : {}),
    ...(labelId ? { labelId } : {}),
    ...(searchQuery ? { searchQuery } : {}),
    ...(sharedNote ? { sharedNote } : {}),
  };
}

export function clearLaunchIntentFromLocation(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const key of ['view', 'capture', 'note', 'label', 'q']) url.searchParams.delete(key);
  if (url.hash.startsWith('#share=')) url.hash = '';

  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

export function encodeSharePayload(payload: {
  title?: string;
  text?: string;
  url?: string;
}): string {
  const json = JSON.stringify({
    title: payload.title ?? '',
    text: payload.text ?? '',
    url: payload.url ?? '',
  });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function parseSharedNoteHash(hash: string): SharedNoteIntent | null {
  if (!hash.startsWith('#share=')) return null;
  const encoded = hash.slice('#share='.length).trim();
  if (!encoded || encoded.length > 2_000_000) return null;

  try {
    const base64 = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const payload = parsed as Record<string, unknown>;
    const title = sanitize(typeof payload.title === 'string' ? payload.title : '', MAX_SHARE_TITLE);
    const text = sanitize(typeof payload.text === 'string' ? payload.text : '', MAX_SHARE_CONTENT);
    const url = sanitize(typeof payload.url === 'string' ? payload.url : '', MAX_SHARE_URL);
    const content = composeSharedContent(text, url);
    if (!title && !content) return null;
    return { title, content };
  } catch {
    return null;
  }
}

function composeSharedContent(text: string, url: string): string {
  const normalizedText = text.trim();
  const normalizedUrl = url.trim();
  if (!normalizedUrl || normalizedText.includes(normalizedUrl)) {
    return normalizedText.slice(0, MAX_SHARE_CONTENT);
  }
  if (!normalizedText) return normalizedUrl.slice(0, MAX_SHARE_CONTENT);
  return `${normalizedText}\n\n${normalizedUrl}`.slice(0, MAX_SHARE_CONTENT);
}

function primeNavigation(intent: LaunchIntent, storage: Storage): void {
  try {
    const section = resolveInitialSection(intent);
    storage.setItem(ACTIVE_SECTION_KEY, section);

    if (intent.labelId && !intent.noteId && !intent.capture && !intent.sharedNote) {
      storage.setItem(ACTIVE_LABEL_KEY, intent.labelId);
    } else if (section !== 'notes' || intent.noteId || intent.capture || intent.sharedNote) {
      storage.removeItem(ACTIVE_LABEL_KEY);
    }
  } catch {
    // Launch intents remain usable through the runtime coordinator when localStorage is unavailable.
  }
}

function resolveInitialSection(intent: LaunchIntent): Exclude<LaunchView, 'search'> {
  if (intent.noteId || intent.labelId || intent.capture || intent.sharedNote || intent.searchQuery) {
    return 'notes';
  }
  if (!intent.view || intent.view === 'search') return 'notes';
  return intent.view;
}

function parseView(value: string | null): LaunchView | undefined {
  return value === 'notes' ||
    value === 'search' ||
    value === 'reminders' ||
    value === 'archive' ||
    value === 'trash' ||
    value === 'backup'
    ? value
    : undefined;
}

function parseCapture(value: string | null): LaunchCapture | undefined {
  return value === 'text' || value === 'checklist' ? value : undefined;
}

function parseUuid(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized && UUID_PATTERN.test(normalized) ? normalized : undefined;
}

function sanitize(value: string | null, limit: number): string {
  return (value ?? '').replace(/\u0000/gu, '').trim().slice(0, limit);
}
