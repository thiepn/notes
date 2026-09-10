import { expect, test, type Page } from '@playwright/test';

async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

test('production manifest exposes P10 shortcuts and POST share target', async ({ page, request }) => {
  await page.goto('./');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const response = await request.get(new URL(manifestHref ?? '', page.url()).toString());
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    shortcuts?: Array<{ name?: string; url?: string }>;
    share_target?: {
      action?: string;
      method?: string;
      enctype?: string;
      params?: Record<string, string>;
    };
  };

  expect(manifest.shortcuts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'New note', url: '/notes/?capture=text' }),
      expect.objectContaining({ name: 'New checklist', url: '/notes/?capture=checklist' }),
      expect.objectContaining({ name: 'Search notes', url: '/notes/?view=search' }),
    ]),
  );
  expect(manifest.share_target).toEqual({
    action: '/notes/share-target',
    method: 'POST',
    enctype: 'multipart/form-data',
    params: { title: 'title', text: 'text', url: 'url' },
  });
});

test('installed PWA receives shared text through the service worker and opens the local note', async ({
  page,
}) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);

  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.action = '/notes/share-target';

    for (const [name, value] of Object.entries({
      title: 'Shared through PWA',
      text: 'This body should stay in the service-worker-controlled share flow.',
      url: 'https://example.test/private-reference',
    })) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }

    document.body.append(form);
    form.submit();
  });

  await expect(page.getByLabel('Title')).toHaveValue('Shared through PWA');
  await expect(page.getByLabel('Note text')).toContainText('service-worker-controlled share flow');
  await expect(page.getByLabel('Note text')).toContainText('https://example.test/private-reference');
  await expect(page).toHaveURL(/\/notes\/$/u);
});
