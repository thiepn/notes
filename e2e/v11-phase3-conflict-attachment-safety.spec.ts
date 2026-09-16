import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';

import type { SupabaseSession } from '../src/features/sync/supabaseApi';
import type { VersionedRemoteSyncRecord } from '../src/features/sync/versionedSyncApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const session: SupabaseSession = {
  access_token: 'v11-phase3-access',
  refresh_token: 'v11-phase3-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'v11-phase3@example.com' },
};

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(',')}}`;
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stable(payload)).digest('hex');
}

function bytesHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function storagePath(url: URL, prefix: string): string {
  return url.pathname
    .slice(prefix.length)
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join('/');
}

interface CloudState {
  rows: VersionedRemoteSyncRecord[];
  objects: Map<string, Buffer>;
  staleAttachmentId?: string;
  staleAttachmentAttempts: number;
  remoteReplacementChecksum?: string;
  remoteReplacementPath?: string;
}

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
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
        if (state.objects.has(path)) return json(route, { message: 'Asset Already Exists' }, 400);
        state.objects.set(path, request.postDataBuffer() ?? Buffer.alloc(0));
        return route.fulfill({ status: 200 });
      }
      if (request.method() === 'DELETE') {
        state.objects.delete(path);
        return route.fulfill({ status: 200 });
      }
    }

    if (url.pathname === '/auth/v1/token') return json(route, { ...session, expires_in: 3600 });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/rpc/has_notes_sync_access') return json(route, true);
    if (url.pathname === '/rest/v1/rpc/list_notes_auth_sessions') return json(route, []);
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

    if (request.method() === 'PATCH') {
      const type = (url.searchParams.get('entity_type') ?? '').replace(/^eq\./u, '');
      const id = (url.searchParams.get('entity_id') ?? '').replace(/^eq\./u, '');
      const expectedVersion = Number((url.searchParams.get('version') ?? '').replace(/^eq\./u, ''));
      let index = state.rows.findIndex((row) => row.entity_type === type && row.entity_id === id);

      if (
        type === 'attachment' &&
        id === state.staleAttachmentId &&
        state.staleAttachmentAttempts === 0 &&
        index >= 0
      ) {
        state.staleAttachmentAttempts += 1;
        const current = state.rows[index]!;
        const remoteBytes = Buffer.from('newer remote attachment bytes');
        const checksum = bytesHash(remoteBytes);
        const path = `${USER}/${id}/${checksum}`;
        const remotePayload = {
          ...current.payload!,
          name: 'remote-winner.txt',
          size: remoteBytes.byteLength,
          checksum,
          storagePath: path,
        };
        state.objects.set(path, remoteBytes);
        state.remoteReplacementChecksum = checksum;
        state.remoteReplacementPath = path;
        state.rows[index] = {
          ...current,
          payload: remotePayload,
          payload_hash: payloadHash(remotePayload),
          client_updated_at: current.client_updated_at + 10_000,
          deleted_at: null,
          version: current.version + 1,
          updated_at: new Date().toISOString(),
        };
        index = state.rows.findIndex((row) => row.entity_type === type && row.entity_id === id);
      }

      const current = index >= 0 ? state.rows[index]! : null;
      if (!current || current.version !== expectedVersion) return json(route, []);
      const patch = request.postDataJSON() as Partial<VersionedRemoteSyncRecord>;
      const updated: VersionedRemoteSyncRecord = {
        ...current,
        payload: patch.payload ?? null,
        payload_hash: patch.payload_hash ?? null,
        client_updated_at: patch.client_updated_at ?? current.client_updated_at,
        deleted_at: patch.deleted_at ?? null,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };
      state.rows[index] = updated;
      return json(route, [updated]);
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

test('attachment bytes use immutable generations and a stale metadata CAS cannot overwrite the newer remote object', async ({
  page,
}) => {
  const state: CloudState = {
    rows: [],
    objects: new Map(),
    staleAttachmentAttempts: 0,
  };
  await installCloud(page, state);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();

  const seeded = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const storage = await import('/notes/src/features/sync/attachmentStorage.ts');
    const note = await new db.NotesRepository(db.notesDatabase).create({
      title: 'Attachment race',
      content: 'Attachment race fixture',
    });
    const data = new Blob(['initial attachment bytes'], { type: 'text/plain' });
    const checksum = await storage.sha256Blob(data);
    const attachment = {
      id: crypto.randomUUID(),
      noteId: note.id,
      name: 'initial.txt',
      mimeType: 'text/plain',
      size: data.size,
      checksum,
      data,
      createdAt: Date.now(),
    };
    await db.notesDatabase.attachments.add(attachment);
    return { noteId: note.id, attachmentId: attachment.id, checksum };
  });

  await sync(page);
  const firstRemote = state.rows.find(
    (row) => row.entity_type === 'attachment' && row.entity_id === seeded.attachmentId,
  )!;
  expect(firstRemote.payload?.storagePath).toBe(
    `${USER}/${seeded.attachmentId}/${seeded.checksum}`,
  );
  expect(state.objects.get(String(firstRemote.payload?.storagePath))?.toString()).toBe(
    'initial attachment bytes',
  );

  const staleLocal = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const storage = await import('/notes/src/features/sync/attachmentStorage.ts');
    const current = await db.notesDatabase.attachments.get(id);
    if (!current) throw new Error('Attachment fixture disappeared.');
    const data = new Blob(['stale local replacement bytes'], { type: 'text/plain' });
    const checksum = await storage.sha256Blob(data);
    await db.notesDatabase.attachments.put({
      ...current,
      name: 'stale-local.txt',
      size: data.size,
      checksum,
      data,
      createdAt: current.createdAt + 100,
    });
    return { checksum, path: `${current.noteId}/${id}/${checksum}` };
  }, seeded.attachmentId);
  state.staleAttachmentId = seeded.attachmentId;

  const result = await sync(page);

  expect(state.staleAttachmentAttempts).toBe(1);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(result.failed).toBe(0);
  expect(result.deferred).toBe(0);

  const remote = state.rows.find(
    (row) => row.entity_type === 'attachment' && row.entity_id === seeded.attachmentId,
  )!;
  expect(remote.version).toBe(2);
  expect(remote.payload?.checksum).toBe(state.remoteReplacementChecksum);
  expect(remote.payload?.storagePath).toBe(state.remoteReplacementPath);
  expect(state.objects.get(state.remoteReplacementPath!)?.toString()).toBe(
    'newer remote attachment bytes',
  );

  const stalePath = `${USER}/${seeded.attachmentId}/${staleLocal.checksum}`;
  expect(state.objects.get(stalePath)?.toString()).toBe('stale local replacement bytes');
  expect(stalePath).not.toBe(state.remoteReplacementPath);

  const localAfter = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const attachment = await db.notesDatabase.attachments.get(id);
    if (!attachment) throw new Error('Attachment was not reconciled locally.');
    return { checksum: attachment.checksum, text: await attachment.data.text() };
  }, seeded.attachmentId);
  expect(localAfter.checksum).toBe(state.remoteReplacementChecksum);
  expect(localAfter.text).toBe('newer remote attachment bytes');
});
