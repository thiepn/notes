import { expect, test } from '@playwright/test';

async function waitForServiceWorkerControl(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
  });

  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!controlled) await page.reload();

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      message: 'The production page should be controlled by the Notes service worker.',
    })
    .toBe(true);
}

test('production manifest is installable and scoped to /notes/', async ({ page, request }) => {
  await page.goto('./');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifestUrl = new URL(manifestHref ?? '', page.url()).toString();
  const manifestResponse = await request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    id?: string;
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
  };

  expect(manifest).toMatchObject({
    id: '/notes/',
    name: 'Notes',
    short_name: 'Notes',
    start_url: '/notes/',
    scope: '/notes/',
    display: 'standalone',
  });

  const icons = manifest.icons ?? [];
  expect(icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
    ]),
  );

  for (const icon of icons) {
    expect(icon.src).toBeTruthy();
    const iconResponse = await request.get(new URL(icon.src ?? '', page.url()).toString());
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }

  await waitForServiceWorkerControl(page);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe('/notes/');
});

test('cold reload, reading, and writing remain functional with the network disabled', async ({
  page,
  context,
}) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Offline seed');
  await page.getByLabel('Note text').fill('Created online before the connection disappears.');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Offline seed' })).toBeVisible();

  await waitForServiceWorkerControl(page);
  await context.setOffline(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note: Offline seed' })).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Written offline');
  await page.getByLabel('Note text').fill('IndexedDB writes must not depend on network access.');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Open note: Written offline' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Open note: Offline seed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note: Written offline' })).toBeVisible();

  await context.setOffline(false);
});

test('install prompt is opt-in and can be dismissed without changing notes', async ({ page }) => {
  await page.goto('./');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });

  await expect(page.getByText('Install Notes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss install prompt' }).click();
  await expect(page.getByText('Install Notes', { exact: true })).not.toBeVisible();
});
