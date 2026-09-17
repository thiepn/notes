import { expect, test, type Page, type Route } from '@playwright/test';

import type { SupabaseSession } from '../src/features/sync/supabaseApi';
import type { VersionedRemoteSyncRecord } from '../src/features/sync/versionedSyncApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const session: SupabaseSession = {
  access_token: 'v11-interrupted-upload-access',
  refresh_token: 'v11-interrupted-upload-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'v11-interrupted-upload@example.com' },
};

interface CloudState {
  rows: VersionedRemoteSyncRecord[];
  objects: Map<string, Buffer>;
  failNextStorageUpload: boolean;
  storageUploadFailures: number;
}

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function storagePath(url: URL, prefix: string): string {
  return url.pathname
    .slice(prefix.length)
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/');
}

async function installCloud(page: Page, state: CloudState) {
  await page.route(`${HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.startsWith('/storage/v1/object/authenticated/notes-attachments/')) {
      const path = storagePath(url, '/storage/v1/object/authenticated/notes-attachments/');
      const bytes = state.objects.get(path);
      if (!bytes) return json(route, { message: 'not found' }, 404);
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: bytes });
    }

    if (url.pathname.startsWith('/storage/v1/object/notes-attachments/')) {
      const path = storagePath(url, '/storage/v1/object/notes-attachments/');
      if (request.method() === 'POST') {
        if (state.failNextStorageUpload) {
          state.failNextStorageUpload = false;
          state.storageUploadFailures += 1;
          return json(route, { message: 'synthetic interrupted upload' }, 503);
        }
        if (state.objects.has(path)) return json(route, { message: 'Asset Already Exists' }, 400);
        state.objects.set(path, request.postDataBuffer() ?? Buffer.alloc(0));
        return route.fulfill({ status: 200 });
      }
    }

    if (url.pathname !== '/rest/v1/notes_sync_records') return route.abort();

    if (request.method() === 'GET') {
      const cursor = url.searchParams.get('or');
      const sorted = [...state.rows].sort((a, b) =>
        `${a.entity_type}:${a.entity_id}`.localeCompare(`${b.entity_type}:${b.entity_id}`),
      );
      if (!cursor) return json(route, sorted.slice(0, 500));
      const type = cursor.match(/entity_type\.eq\.([a-z_]+)/)?.[1] ?? '';
      const id = cursor.match(/entity_id\.gt\.([^)]*)/)?.[1] ?? '';
      return json(
        route,
        sorted
          .filter(
            (row) => row.entity_type > type || (row.entity_type === type && row.entity_id > id),
          )
          .slice(0, 500),
      );
    }

    if (request.method() === 'POST') {
      const incoming = request.postDataJSON() as Omit<VersionedRemoteSyncRecord, 'version'>;
      const duplicate = state.rows.some(
        (row) => row.entity_type === incoming.entity_type && row.entity_id === incoming.entity_id,
      );
      if (duplicate) return json(route, { code: '23505' }, 409);
      const created: VersionedRemoteSyncRecord = {
        ...incoming,
        version: 1,
        updated_at: new Date().toISOString(),
      };
      state.rows.push(created);
      return json(route, [created], 201);
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

test('an interrupted immutable upload cannot publish metadata and the next sync recovers it', async ({
  page,
}) => {
  const state: CloudState = {
    rows: [],
    objects: new Map(),
    failNextStorageUpload: true,
    storageUploadFailures: 0,
  };
  await installCloud(page, state);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();

  const fixture = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const storage = await import('/notes/src/features/sync/attachmentStorage.ts');
    const note = await new db.NotesRepository(db.notesDatabase).create({
      title: 'Interrupted attachment upload',
      content: 'Retry fixture',
    });
    const data = new Blob(['recoverable attachment bytes'], { type: 'text/plain' });
    const checksum = await storage.sha256Blob(data);
    const attachment = {
      id: crypto.randomUUID(),
      noteId: note.id,
      name: 'recoverable.txt',
      mimeType: 'text/plain',
      size: data.size,
      checksum,
      data,
      createdAt: Date.now(),
    };
    await db.notesDatabase.attachments.add(attachment);
    return { attachmentId: attachment.id, checksum };
  });

  const first = await sync(page);
  const immutablePath = `${USER}/${fixture.attachmentId}/${fixture.checksum}`;

  expect(state.storageUploadFailures).toBe(1);
  expect(first.failed).toBeGreaterThan(0);
  expect(
    state.rows.some(
      (row) => row.entity_type === 'attachment' && row.entity_id === fixture.attachmentId,
    ),
  ).toBe(false);
  expect(state.objects.has(immutablePath)).toBe(false);

  const second = await sync(page);
  const remote = state.rows.find(
    (row) => row.entity_type === 'attachment' && row.entity_id === fixture.attachmentId,
  );

  expect(second.failed).toBe(0);
  expect(remote?.version).toBe(1);
  expect(remote?.payload?.storagePath).toBe(immutablePath);
  expect(state.objects.get(immutablePath)?.toString()).toBe('recoverable attachment bytes');
});
