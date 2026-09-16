import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

import type { SupabaseSession } from '../src/features/sync/supabaseApi';
import type { VersionedRemoteSyncRecord } from '../src/features/sync/versionedSyncApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session: SupabaseSession = {
  access_token: 'v11-access',
  refresh_token: 'v11-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'v11@example.com' },
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

function hash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stable(payload)).digest('hex');
}

interface CloudControl {
  stalePatchId?: string;
  collideCreateId?: string;
  stalePatchAttempts: number;
  createCollisionAttempts: number;
  readsAfterCreateCollision: number;
  childPostsBeforeFreshRead: number;
}

function control(): CloudControl {
  return {
    stalePatchAttempts: 0,
    createCollisionAttempts: 0,
    readsAfterCreateCollision: 0,
    childPostsBeforeFreshRead: 0,
  };
}

async function installCloud(page: Page, rows: VersionedRemoteSyncRecord[], state: CloudControl) {
  await page.route(`${HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (url.pathname === '/auth/v1/token') return json({ ...session, expires_in: 3600 });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/rpc/has_notes_sync_access') return json(true);
    if (url.pathname === '/rest/v1/rpc/list_notes_auth_sessions') return json([]);
    if (url.pathname !== '/rest/v1/notes_sync_records') return route.abort();

    if (request.method() === 'GET') {
      if (state.createCollisionAttempts > 0) state.readsAfterCreateCollision += 1;
      const cursor = url.searchParams.get('or');
      const sorted = [...rows].sort((a, b) =>
        `${a.entity_type}:${a.entity_id}`.localeCompare(`${b.entity_type}:${b.entity_id}`),
      );
      if (!cursor) return json(sorted.slice(0, 500));
      const type = cursor.match(/entity_type\.eq\.([a-z_]+)/)?.[1] ?? '';
      const id = cursor.match(/entity_id\.gt\.([^)]*)/)?.[1] ?? '';
      return json(
        sorted
          .filter(
            (row) => row.entity_type > type || (row.entity_type === type && row.entity_id > id),
          )
          .slice(0, 500),
      );
    }

    if (request.method() === 'POST') {
      const incoming = request.postDataJSON() as Omit<VersionedRemoteSyncRecord, 'version'>;
      if (
        incoming.entity_type === 'checklist_item' &&
        state.createCollisionAttempts > 0 &&
        state.readsAfterCreateCollision === 0
      ) {
        state.childPostsBeforeFreshRead += 1;
      }
      if (
        incoming.entity_type === 'note' &&
        incoming.entity_id === state.collideCreateId &&
        state.createCollisionAttempts === 0
      ) {
        state.createCollisionAttempts += 1;
        const remotePayload = {
          ...incoming.payload!,
          title: 'Created on another device',
          content: 'Remote concurrent create',
          updatedAt: Number(incoming.client_updated_at) + 1,
        };
        rows.push({
          ...incoming,
          payload: remotePayload,
          payload_hash: hash(remotePayload),
          client_updated_at: Number(incoming.client_updated_at) + 1,
          version: 1,
          updated_at: new Date().toISOString(),
        });
        return json({ code: '23505' }, 409);
      }

      const duplicate = rows.some(
        (row) => row.entity_type === incoming.entity_type && row.entity_id === incoming.entity_id,
      );
      if (duplicate) return json({ code: '23505' }, 409);
      const created: VersionedRemoteSyncRecord = {
        ...incoming,
        version: 1,
        updated_at: new Date().toISOString(),
      };
      rows.push(created);
      return json([created], 201);
    }

    if (request.method() === 'PATCH') {
      const type = (url.searchParams.get('entity_type') ?? '').replace(/^eq\./u, '');
      const id = (url.searchParams.get('entity_id') ?? '').replace(/^eq\./u, '');
      const expectedVersion = Number((url.searchParams.get('version') ?? '').replace(/^eq\./u, ''));
      let index = rows.findIndex((row) => row.entity_type === type && row.entity_id === id);

      if (
        type === 'note' &&
        id === state.stalePatchId &&
        state.stalePatchAttempts === 0 &&
        index >= 0
      ) {
        state.stalePatchAttempts += 1;
        const current = rows[index]!;
        const remotePayload = {
          ...current.payload!,
          title: 'Remote concurrent winner',
          content: 'A newer remote edit arrived first.',
          updatedAt: current.client_updated_at + 1_000,
          revision: Number(current.payload?.revision ?? 1) + 1,
        };
        rows[index] = {
          ...current,
          payload: remotePayload,
          payload_hash: hash(remotePayload),
          client_updated_at: current.client_updated_at + 1_000,
          deleted_at: null,
          version: current.version + 1,
          updated_at: new Date().toISOString(),
        };
        index = rows.findIndex((row) => row.entity_type === type && row.entity_id === id);
      }

      const current = index >= 0 ? rows[index]! : null;
      if (!current || current.version !== expectedVersion) return json([]);
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
      rows[index] = updated;
      return json([updated]);
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

async function createLocal(page: Page, title: string) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
  return page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    return new db.NotesRepository(db.notesDatabase).create({
      title: noteTitle,
      content: 'Initial local content',
    });
  }, title);
}

test('a stale update is rejected and reconciled against the newer remote version in the same sync', async ({
  page,
}) => {
  const rows: VersionedRemoteSyncRecord[] = [];
  const state = control();
  await installCloud(page, rows, state);
  const note = await createLocal(page, 'Versioned update');
  await sync(page);

  await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase);
    const current = await repository.require(id);
    await repository.update(id, { content: 'Stale local edit' }, current.revision);
  }, note.id);
  state.stalePatchId = note.id;

  const result = await sync(page);

  expect(state.stalePatchAttempts).toBe(1);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(result.failed).toBe(0);
  const remote = rows.find((row) => row.entity_type === 'note' && row.entity_id === note.id)!;
  expect(remote.version).toBe(2);
  expect(remote.payload?.content).toBe('A newer remote edit arrived first.');
  expect(
    await page.evaluate(async (id) => {
      const db = await import('/notes/src/db/index.ts');
      return (await new db.NotesRepository(db.notesDatabase).require(id)).content;
    }, note.id),
  ).toBe('A newer remote edit arrived first.');
});

test('a concurrent create is rejected and both versions remain recoverable after same-pass reconciliation', async ({
  page,
}) => {
  const rows: VersionedRemoteSyncRecord[] = [];
  const state = control();
  await installCloud(page, rows, state);
  const note = await createLocal(page, 'Concurrent create');
  state.collideCreateId = note.id;

  const result = await sync(page);

  expect(state.createCollisionAttempts).toBe(1);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(result.conflictCopies).toBeGreaterThan(0);
  const remote = rows.find((row) => row.entity_type === 'note' && row.entity_id === note.id)!;
  expect(remote.version).toBe(1);
  expect(remote.payload?.content).toBe('Remote concurrent create');
  const local = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return {
      current: await new db.NotesRepository(db.notesDatabase).require(id),
      notes: await db.notesDatabase.notes.toArray(),
    };
  }, note.id);
  expect(local.current.title).toBe('Created on another device');
  expect(local.notes.some((item) => item.title.includes('conflict copy (this device'))).toBe(true);
});

test('a note create conflict never uploads dependent checklist rows before the fresh reconciliation read', async ({
  page,
}) => {
  const rows: VersionedRemoteSyncRecord[] = [];
  const state = control();
  await installCloud(page, rows, state);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
  const created = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return new db.ChecklistsRepository(db.notesDatabase).create('Concurrent checklist', [
      { id: crypto.randomUUID(), text: 'Local child one', checked: false, parentId: null },
      { id: crypto.randomUUID(), text: 'Local child two', checked: false, parentId: null },
    ]);
  });
  state.collideCreateId = created.note.id;

  await sync(page);

  expect(state.createCollisionAttempts).toBe(1);
  expect(state.readsAfterCreateCollision).toBeGreaterThan(0);
  expect(state.childPostsBeforeFreshRead).toBe(0);
});

test('a stale delete is rejected and the newer remote edit is restored locally in the same sync', async ({
  page,
}) => {
  const rows: VersionedRemoteSyncRecord[] = [];
  const state = control();
  await installCloud(page, rows, state);
  const note = await createLocal(page, 'Versioned delete');
  await sync(page);

  await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    await db.notesDatabase.notes.delete(id);
  }, note.id);
  state.stalePatchId = note.id;

  const result = await sync(page);

  expect(state.stalePatchAttempts).toBe(1);
  expect(result.conflicts).toBeGreaterThan(0);
  const remote = rows.find((row) => row.entity_type === 'note' && row.entity_id === note.id)!;
  expect(remote.version).toBe(2);
  expect(remote.deleted_at).toBeNull();
  expect(remote.payload?.content).toBe('A newer remote edit arrived first.');
  expect(
    await page.evaluate(async (id) => {
      const db = await import('/notes/src/db/index.ts');
      return (await new db.NotesRepository(db.notesDatabase).require(id)).content;
    }, note.id),
  ).toBe('A newer remote edit arrived first.');
});
