from pathlib import Path

path = Path('pwa-e2e/pwa.spec.ts')
text = path.read_text()
old = """  expect(online.every((entry) => entry.ok)).toBe(true);

  await context.setOffline(true);
"""
new = """  expect(online.every((entry) => entry.ok)).toBe(true);

  await expect
    .poll(
      () =>
        page.evaluate(async (assetPaths) => {
          const cacheNames = await caches.keys();
          const cached = await Promise.all(
            assetPaths.map(async (path) => {
              const target = new URL(path, location.origin).toString();
              for (const cacheName of cacheNames) {
                const cache = await caches.open(cacheName);
                if (await cache.match(target)) return true;
              }
              return false;
            }),
          );
          return cached.every(Boolean);
        }, paths),
      { message: 'OCR runtime assets should finish populating the runtime cache.' },
    )
    .toBe(true);

  await context.setOffline(true);
"""
if text.count(old) != 1:
    raise SystemExit('Could not align OCR runtime-cache certification')
path.write_text(text.replace(old, new, 1))
