import { expect, test, type Page } from '@playwright/test';

const RICH_CACHE = 'notes-share-target-v2';
const LEGACY_CACHE = 'notes-share-target-v1';
const PAYLOAD_PREFIX = '/notes/share-payload/';
const STAGE_VERSION_HEADER = 'X-Notes-Share-Stage-Version';
const STAGED_AT_HEADER = 'X-Notes-Share-Staged-At';

interface StageOptions {
  title: string;
  text?: string;
  url?: string;
  file?: { name: string; type: string; content: string };
}

async function stageRichShare(page: Page, shareKey: string, options: StageOptions) {
  await page.evaluate(
    async ({ key, value, cacheName, prefix, versionHeader, stagedAtHeader }) => {
      const form = new FormData();
      form.set('title', value.title);
      form.set('text', value.text ?? '');
      form.set('url', value.url ?? '');
      if (value.file) {
        form.append(
          'files',
          new File([value.file.content], value.file.name, { type: value.file.type }),
          value.file.name,
        );
      }
      const cache = await caches.open(cacheName);
      const payloadUrl = new URL(`${prefix}${key}`, location.origin).toString();
      await cache.put(
        payloadUrl,
        new Response(form, {
          headers: {
            [versionHeader]: '2',
            [stagedAtHeader]: String(Date.now()),
            'Cache-Control': 'no-store',
          },
        }),
      );
      history.replaceState(history.state, '', `/notes/#share=${key}`);
    },
    {
      key: shareKey,
      value: options,
      cacheName: RICH_CACHE,
      prefix: PAYLOAD_PREFIX,
      versionHeader: STAGE_VERSION_HEADER,
      stagedAtHeader: STAGED_AT_HEADER,
    },
  );
}

async function noteTitles(page: Page) {
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.toArray()).map((note) => note.title);
  });
}

async function cacheHasShare(page: Page, cacheName: string, shareKey: string) {
  return page.evaluate(
    async ({ name, key, prefix }) => {
      const cache = await caches.open(name);
      const url = new URL(`${prefix}${key}`, location.origin).toString();
      return Boolean(await cache.match(url));
    },
    { name: cacheName, key: shareKey, prefix: PAYLOAD_PREFIX },
  );
}

test('replaying the same share token resolves to the exact same durable note', async ({ page }) => {
  const key = '44444444-4444-4444-8444-444444444441';
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();

  await stageRichShare(page, key, {
    title: 'Exact-once shared note',
    text: 'Original shared body.',
    file: { name: 'evidence.txt', type: 'text/plain', content: 'original attachment' },
  });
  await page.reload();
  await expect(page.getByLabel('Title')).toHaveValue('Exact-once shared note');

  const firstState = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await db.notesDatabase.notes.toArray();
    const note = notes.find((candidate) => candidate.title === 'Exact-once shared note');
    return {
      count: notes.length,
      noteId: note?.id ?? null,
      attachments: note
        ? await db.notesDatabase.attachments.where('noteId').equals(note.id).count()
        : 0,
    };
  });
  expect(firstState.noteId).toBeTruthy();
  expect(firstState.attachments).toBe(1);

  await stageRichShare(page, key, {
    title: 'This replay must not create a note',
    text: 'Different replay body.',
    file: { name: 'different.txt', type: 'text/plain', content: 'different attachment' },
  });
  await page.reload();

  const secondState = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await db.notesDatabase.notes.toArray();
    const original = notes.find((candidate) => candidate.title === 'Exact-once shared note');
    return {
      count: notes.length,
      originalId: original?.id ?? null,
      replayExists: notes.some(
        (candidate) => candidate.title === 'This replay must not create a note',
      ),
      attachments: original
        ? await db.notesDatabase.attachments.where('noteId').equals(original.id).count()
        : 0,
    };
  });
  expect(secondState.count).toBe(firstState.count);
  expect(secondState.originalId).toBe(firstState.noteId);
  expect(secondState.replayExists).toBe(false);
  expect(secondState.attachments).toBe(1);
  expect(await cacheHasShare(page, RICH_CACHE, key)).toBe(false);
});

test('privacy lock leaves a staged rich share untouched until the user unlocks Notes', async ({
  page,
}) => {
  const key = '44444444-4444-4444-8444-444444444442';
  const passcode = 'phase4-private-share';
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();

  await stageRichShare(page, key, {
    title: 'Locked rich share',
    text: 'Do not reveal or consume this before unlock.',
    file: { name: 'locked.pdf', type: 'application/pdf', content: '%PDF-1.4\nlocked\n%%EOF' },
  });
  await page.evaluate(async (value) => {
    const privacy = await import('/notes/src/features/privacy/privacy.ts');
    const credential = await privacy.createPrivacyCredential(value);
    localStorage.setItem('notes.privacy.credential.v1', JSON.stringify(credential));
  }, passcode);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  expect(await noteTitles(page)).not.toContain('Locked rich share');
  expect(await cacheHasShare(page, RICH_CACHE, key)).toBe(true);

  await page.getByLabel('Passcode').fill(passcode);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toHaveCount(0);
  await expect(page.getByLabel('Title')).toHaveValue('Locked rich share');
  expect(await noteTitles(page)).toContain('Locked rich share');
  expect(await cacheHasShare(page, RICH_CACHE, key)).toBe(false);
});

test('v1 text-only staged shares remain consumable during the v1.1 rollout', async ({ page }) => {
  const key = '44444444-4444-4444-8444-444444444443';
  await page.goto('./');
  await page.evaluate(
    async ({ shareKey, cacheName, prefix }) => {
      const cache = await caches.open(cacheName);
      const payloadUrl = new URL(`${prefix}${shareKey}`, location.origin).toString();
      await cache.put(
        payloadUrl,
        new Response(
          JSON.stringify({
            title: 'Legacy staged share',
            text: 'Captured by the old service worker.',
            url: 'https://example.test/legacy',
          }),
          { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        ),
      );
      history.replaceState(history.state, '', `/notes/#share=${shareKey}`);
    },
    { shareKey: key, cacheName: LEGACY_CACHE, prefix: PAYLOAD_PREFIX },
  );
  await page.reload();

  await expect(page.getByLabel('Title')).toHaveValue('Legacy staged share');
  await expect(page.getByLabel('Note text')).toContainText('Captured by the old service worker.');
  await expect(page.getByLabel('Note text')).toContainText('https://example.test/legacy');
  expect(await cacheHasShare(page, LEGACY_CACHE, key)).toBe(false);
});

test('an unsupported staged file is rejected without creating a partial note', async ({ page }) => {
  const key = '44444444-4444-4444-8444-444444444444';
  await page.goto('./');
  await stageRichShare(page, key, {
    title: 'Unsafe staged payload',
    file: { name: 'program.exe', type: 'application/x-msdownload', content: 'MZ-not-an-app-file' },
  });
  await page.reload();

  await expect.poll(() => page.url()).toMatch(/\/notes\/$/u);
  expect(await noteTitles(page)).not.toContain('Unsafe staged payload');
  expect(await cacheHasShare(page, RICH_CACHE, key)).toBe(false);
});
