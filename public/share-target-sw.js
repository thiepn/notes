/* v1.1 rich share target: one-time, device-local handoff for text and supported files. */
const NOTES_SHARE_TARGET_PATH = '/notes/share-target';
const NOTES_SHARE_CACHE = 'notes-share-target-v2';
const NOTES_SHARE_PAYLOAD_PREFIX = '/notes/share-payload/';
const SHARE_STAGE_VERSION_HEADER = 'X-Notes-Share-Stage-Version';
const SHARE_STAGED_AT_HEADER = 'X-Notes-Share-Staged-At';
const MAX_PENDING_SHARES = 8;
const MAX_SHARE_STAGE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SHARED_FILES = 20;
const MAX_SHARED_STAGED_BYTES = 100 * 1024 * 1024;
const MAX_SHARE_TITLE = 500;
const MAX_SHARE_CONTENT = 1_000_000;
const MAX_SHARE_URL = 16_384;

const SUPPORTED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
]);

const MIME_BY_EXTENSION = {
  aac: 'audio/aac',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/x-m4a',
  md: 'text/markdown',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'audio/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

globalThis.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;

  const url = new globalThis.URL(request.url);
  if (url.pathname !== NOTES_SHARE_TARGET_PATH) return;

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData();
        const staged = new globalThis.FormData();
        const title = readString(form, 'title', MAX_SHARE_TITLE);
        const text = readString(form, 'text', MAX_SHARE_CONTENT);
        const sharedUrl = readString(form, 'url', MAX_SHARE_URL);
        staged.set('title', title);
        staged.set('text', text);
        staged.set('url', sharedUrl);

        const files = form.getAll('files').filter(isFileEntry);
        if (files.length > MAX_SHARED_FILES) throw new Error('Too many shared files.');
        let totalBytes = 0;
        for (const file of files) {
          if (!Number.isSafeInteger(file.size) || file.size <= 0) {
            throw new Error('A shared file is empty or has an invalid size.');
          }
          const mimeType = sharedFileMimeType(file);
          if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
            throw new Error('A shared file type is not supported.');
          }
          totalBytes += file.size;
          if (totalBytes > MAX_SHARED_STAGED_BYTES) throw new Error('Shared payload is too large.');
          staged.append('files', file, safeFileName(file.name));
        }

        if (!title && !text && !sharedUrl && files.length === 0) {
          return redirect('/notes/');
        }

        const key = globalThis.crypto.randomUUID();
        const cache = await globalThis.caches.open(NOTES_SHARE_CACHE);
        await prunePendingShares(cache);
        const payloadUrl = new globalThis.URL(
          `${NOTES_SHARE_PAYLOAD_PREFIX}${key}`,
          globalThis.location.origin,
        ).toString();
        await cache.put(
          payloadUrl,
          new globalThis.Response(staged, {
            headers: {
              [SHARE_STAGE_VERSION_HEADER]: '2',
              [SHARE_STAGED_AT_HEADER]: String(Date.now()),
              'Cache-Control': 'no-store',
            },
          }),
        );
        return redirect(`/notes/#share=${key}`);
      } catch {
        return redirect('/notes/');
      }
    })(),
  );
});

async function prunePendingShares(cache) {
  const now = Date.now();
  const entries = [];
  for (const request of await cache.keys()) {
    const pathname = new globalThis.URL(request.url).pathname;
    if (!pathname.startsWith(NOTES_SHARE_PAYLOAD_PREFIX)) continue;
    const response = await cache.match(request);
    const stagedAt = Number(response?.headers.get(SHARE_STAGED_AT_HEADER));
    if (!Number.isFinite(stagedAt) || stagedAt <= 0 || now - stagedAt > MAX_SHARE_STAGE_AGE_MS) {
      await cache.delete(request);
      continue;
    }
    entries.push({ request, stagedAt });
  }
  entries.sort((a, b) => a.stagedAt - b.stagedAt);
  while (entries.length >= MAX_PENDING_SHARES) {
    const oldest = entries.shift();
    if (oldest) await cache.delete(oldest.request);
  }
}

function redirect(path) {
  return globalThis.Response.redirect(
    new globalThis.URL(path, globalThis.location.origin).toString(),
    303,
  );
}

function readString(form, key, limit) {
  const value = form.get(key);
  return typeof value === 'string' ? value.replaceAll('\0', '').trim().slice(0, limit) : '';
}

function isFileEntry(value) {
  return (
    typeof value !== 'string' &&
    value !== null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.size === 'number' &&
    typeof value.type === 'string'
  );
}

function sharedFileMimeType(file) {
  const declared = String(file.type || '')
    .trim()
    .toLocaleLowerCase()
    .split(';', 1)[0];
  if (SUPPORTED_MIME_TYPES.has(declared)) return declared;
  const extension = String(file.name || '')
    .split('.')
    .pop()
    ?.trim()
    .toLocaleLowerCase();
  return extension ? (MIME_BY_EXTENSION[extension] ?? declared) : declared;
}

function safeFileName(name) {
  const normalized = String(name || '')
    .replaceAll('\0', '')
    .replaceAll('/', '_')
    .replaceAll('\\', '_')
    .trim();
  return (normalized || 'shared-file').slice(0, 1_024);
}
