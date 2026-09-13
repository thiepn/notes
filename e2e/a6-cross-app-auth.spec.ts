import { expect, test } from '@playwright/test';
import type { SupabaseSession } from '../src/features/sync/supabaseApi';

const SHARED_AUTH_KEY = 'sb-hycegznamzjhwinegaai-auth-token';
const session: SupabaseSession = {
  access_token: ['mock', 'access', 'a6'].join('-'),
  refresh_token: ['mock', 'refresh', 'a6'].join('-'),
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'a6@example.com',
  },
};

async function mutateSharedAuthFromSiblingContext(
  page: import('@playwright/test').Page,
  value: SupabaseSession | null,
) {
  await page.evaluate(
    ({ key, next }) => {
      const frame = document.createElement('iframe');
      frame.hidden = true;
      frame.src = 'about:blank';
      document.body.append(frame);
      const siblingStorage = frame.contentWindow?.localStorage;
      if (!siblingStorage) throw new Error('Same-origin sibling storage was unavailable.');
      if (next) siblingStorage.setItem(key, JSON.stringify(next));
      else siblingStorage.removeItem(key);
      frame.remove();
    },
    { key: SHARED_AUTH_KEY, next: value },
  );
}

test('A6 shared sign-out from another tab clears the Notes session and preserves local data', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    },
    { key: SHARED_AUTH_KEY, value: session },
  );

  await page.goto('./');
  const status = page.locator('.workspace-meta .sync-indicator');
  await expect(status).toContainText('Offline');

  await page.evaluate(async () => {
    const d = await import('/notes/src/db/index.ts');
    await new d.NotesRepository(d.notesDatabase).create({
      title: 'A6 local note',
      content: 'Must survive shared-account sign-out.',
    });
  });
  await page.reload();
  await expect(status).toContainText('Offline');
  await expect(page.getByRole('button', { name: 'Open note: A6 local note' })).toBeVisible();

  await mutateSharedAuthFromSiblingContext(page, null);

  await expect(status).toContainText('Local only');
  expect(await page.evaluate((key) => localStorage.getItem(key), SHARED_AUTH_KEY)).toBeNull();
  await expect(page.getByRole('button', { name: 'Open note: A6 local note' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const d = await import('/notes/src/db/index.ts');
      const notes = await d.notesDatabase.notes.toArray();
      return notes.filter((note) => note.title === 'A6 local note').length;
    }),
  ).toBe(1);
});

test('A6 shared sign-in from another tab is adopted without a legacy Notes session', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });

  await page.goto('./');
  const status = page.locator('.workspace-meta .sync-indicator');
  await expect(status).toContainText('Local only');

  await mutateSharedAuthFromSiblingContext(page, session);

  await expect(status).toContainText('Offline');
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.user?.id,
      SHARED_AUTH_KEY,
    ),
  ).toBe(session.user.id);
  expect(await page.evaluate(() => localStorage.getItem('notes.supabase.session.v1'))).toBeNull();
});
