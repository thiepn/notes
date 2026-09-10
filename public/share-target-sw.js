/* P10 share target: keep shared text inside the service-worker-controlled client flow. */
const NOTES_SHARE_TARGET_PATH = '/notes/share-target';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;

  const url = new URL(request.url);
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
        const encoded = encodePayload(payload);
        return Response.redirect(`/notes/#share=${encoded}`, 303);
      } catch {
        return Response.redirect('/notes/', 303);
      }
    })(),
  );
});

function readString(form, key) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
