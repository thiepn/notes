import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import type { RemoteSyncRecord, SupabaseSession } from '../src/features/sync/supabaseApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session: SupabaseSession = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'test@example.com' },
};
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(record[k])}`)
    .join(',')}}`;
}
function remoteNote(title: string, id = randomUUID()): RemoteSyncRecord {
  const now = Date.now();
  const payload = {
    id,
    type: 'text',
    title,
    content: 'Cloud content',
    color: 'default',
    createdAt: now,
    updatedAt: now,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
  };
  return {
    user_id: USER,
    entity_type: 'note',
    entity_id: id,
    payload,
    payload_hash: createHash('sha256').update(stable(payload)).digest('hex'),
    client_updated_at: now,
    deleted_at: null,
    updated_at: new Date(now).toISOString(),
  };
}
async function cloud(page: Page, rows: RemoteSyncRecord[], onUpload?: () => Promise<void>) {
  await page.route(`${HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/auth/v1/token') return json({ ...session, expires_in: 3600 });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/rpc/has_notes_sync_access') return json(true);
    if (url.pathname === '/rest/v1/rpc/list_notes_auth_sessions') return json([]);
    if (url.pathname === '/rest/v1/notes_sync_records') {
      if (request.method() === 'GET') {
        const cursor = url.searchParams.get('or');
        if (cursor) {
          const type = cursor.match(/entity_type\.eq\.([a-z_]+)/)?.[1] ?? '';
          const id = cursor.match(/entity_id\.gt\.([^)]*)/)?.[1] ?? '';
          return json(
            rows
              .filter(
                (row) => row.entity_type > type || (row.entity_type === type && row.entity_id > id),
              )
              .slice(0, 500),
          );
        }
        return json(
          [...rows]
            .sort((a, b) =>
              `${a.entity_type}:${a.entity_id}`.localeCompare(`${b.entity_type}:${b.entity_id}`),
            )
            .slice(0, 500),
        );
      }
      if (request.method() === 'POST') {
        await onUpload?.();
        const record = request.postDataJSON() as RemoteSyncRecord;
        const index = rows.findIndex(
          (r) => r.entity_type === record.entity_type && r.entity_id === record.entity_id,
        );
        if (index < 0) rows.push(record);
        else rows[index] = record;
        return route.fulfill({ status: 204 });
      }
    }
    return route.abort();
  });
}
async function sync(page: Page) {
  return page.evaluate(
    async (value) =>
      (await import('/notes/src/features/sync/syncEngine.ts')).synchronizeNotes(value),
    session,
  );
}
async function seedLocal(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
  const note = await page.evaluate(async () => {
    const d = await import('/notes/src/db/index.ts');
    return new d.NotesRepository(d.notesDatabase).create({
      title: 'Local draft',
      content: 'Keep this local text.',
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open note: Local draft' })).toBeVisible();
  return note;
}

test('invalid cloud checksums never replace the local library', async ({ page }) => {
  const bad = { ...remoteNote('Invalid cloud record'), payload_hash: 'invalid-checksum' };
  await cloud(page, [bad]);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
  const result = await sync(page);
  expect(result.failed).toBe(1);
  expect(result.downloaded).toBe(0);
  expect(
    await page.evaluate(async () =>
      (await import('/notes/src/db/index.ts')).notesDatabase.notes.count(),
    ),
  ).toBe(0);
});

test('incoming notes refresh in place while an active note is deferred', async ({ page }) => {
  const rows: RemoteSyncRecord[] = [];
  await cloud(page, rows);
  const local = await seedLocal(page);
  await sync(page);
  await page.getByRole('button', { name: 'Open note: Local draft' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note', exact: true });
  const replacement = remoteNote('Cloud edited title', local.id);
  rows.splice(
    rows.findIndex((r) => r.entity_id === local.id),
    1,
    replacement,
  );
  rows.push(remoteNote('A new incoming note'));
  const result = await sync(page);
  expect(result.deferred).toBeGreaterThan(0);
  expect(result.downloaded).toBeGreaterThan(0);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Edit title' })).toHaveValue('Local draft');
  await expect(editor.getByRole('textbox', { name: 'Edit note text' })).toHaveValue(
    'Keep this local text.',
  );
  await expect(
    page.locator('.note-card-title').filter({ hasText: 'A new incoming note' }),
  ).toHaveCount(1);
});

test('a local edit during upload stays pending and uploads on the following sync', async ({
  page,
}) => {
  const rows: RemoteSyncRecord[] = [];
  let release!: () => void;
  let started = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstUpload = true;
  await cloud(page, rows, async () => {
    if (firstUpload) {
      firstUpload = false;
      started = true;
      await gate;
    }
  });
  const note = await seedLocal(page);
  const firstSync = sync(page);
  await expect.poll(() => started).toBe(true);
  await page.evaluate(async (id) => {
    const d = await import('/notes/src/db/index.ts');
    const repository = new d.NotesRepository(d.notesDatabase);
    const current = await repository.require(id);
    await repository.update(
      id,
      { content: 'Edited while the request was running.' },
      current.revision,
    );
  }, note.id);
  release();
  expect((await firstSync).deferred).toBeGreaterThan(0);
  await sync(page);
  expect(rows.find((r) => r.entity_id === note.id)?.payload?.content).toBe(
    'Edited while the request was running.',
  );
});

test('offline startup retains the sign-in and automatically reconnects', async ({ page }) => {
  const rows: RemoteSyncRecord[] = [];
  await cloud(page, rows);
  await page.addInitScript((value) => {
    localStorage.setItem('notes.supabase.session.v1', JSON.stringify(value));
    let online = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    window.addEventListener('test-reconnect', () => {
      online = true;
      window.dispatchEvent(new Event('online'));
    });
  }, session);
  await page.goto('./');
  const status = page.locator('.workspace-meta .sync-indicator');
  await expect(status).toContainText('Offline');
  expect(
    await page.evaluate(() => localStorage.getItem('notes.supabase.session.v1')),
  ).not.toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('test-reconnect')));
  await expect(status).toContainText('Synced');
});
