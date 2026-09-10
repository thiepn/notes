/* P10 share target: keep shared content in a device-local handoff cache. */
const NOTES_SHARE_TARGET_PATH = '/notes/share-target';
const NOTES_SHARE_CACHE = 'notes-share-target-v1';
const NOTES_SHARE_PAYLOAD_PREFIX = '/notes/share-payload/';
const MAX_PENDING_SHARES = 8;

globalThis.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;

  const url = new globalThis.URL(request.url);
  if (url.pathname !== NOTES_SHARE_TARGET_PATH) return;

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData();
        const payload = {
          title: readString(form, 'title'),
          text: readString(form, 'text'),
          url: readString(form, 'url'),
        };
        const key = globalThis.crypto.randomUUID();
        const cache = await globalThis.caches.open(NOTES_SHARE_CACHE);
        const pending = await cache.keys();
        if (pending.length >= MAX_PENDING_SHARES) {
          await Promise.all(
            pending
              .slice(0, pending.length - MAX_PENDING_SHARES + 1)
              .map((entry) => cache.delete(entry)),
          );
        }
        await cache.put(
          new globalThis.URL(
            `${NOTES_SHARE_PAYLOAD_PREFIX}${key}`,
            globalThis.location.origin,
          ).toString(),
          new globalThis.Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
        );
        return globalThis.Response.redirect(
          new globalThis.URL(`/notes/#share=${key}`, globalThis.location.origin).toString(),
          303,
        );
      } catch {
        return globalThis.Response.redirect(
          new globalThis.URL('/notes/', globalThis.location.origin).toString(),
          303,
        );
      }
    })(),
  );
});

function readString(form, key) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
