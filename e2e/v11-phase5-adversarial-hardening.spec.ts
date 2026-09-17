import { expect, test, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';

import type { SupabaseSession } from '../src/features/sync/supabaseApi';
import type { VersionedRemoteSyncRecord } from '../src/features/sync/versionedSyncApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FIXED_NOTE_ID = '55555555-5555-4555-8555-555555555555';
const session: SupabaseSession = {
  access_token: 'v11-phase5-access',
  refresh_token: 'v11-phase5-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'v11-phase5@example.com' },
};

interface CloudState {
  rows: VersionedRemoteSyncRecord[];
  posts: number;
  patches: number;
  stormNoteId?: string;
  stormRemaining: number;
  stormSequence: number;
}

function createCloudState(): CloudState {
  return {
    rows: [],
    posts: 0,
    patches: 0,
    stormRemaining: 0,
    stormSequence: 0,
  };
}

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
      const type = cursor.match(/entity_type\.eq\.([a-z_]+)/u)?.[1] ?? '';
      const id = cursor.match(/entity_id\.gt\.([^)]*)/u)?.[1] ?? '';
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
      state.posts += 1;
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
      state.patches += 1;
      const type = (url.searchParams.get('entity_type') ?? '').replace(/^eq\./u, '');
      const id = (url.searchParams.get('entity_id') ?? '').replace(/^eq\./u, '');
      const expectedVersion = Number((url.searchParams.get('version') ?? '').replace(/^eq\./u, ''));
      let index = state.rows.findIndex((row) => row.entity_type === type && row.entity_id === id);

      if (
        type === 'note' &&
        id === state.stormNoteId &&
        state.stormRemaining > 0 &&
        index >= 0
      ) {
        state.stormRemaining -= 1;
        state.stormSequence += 1;
        const current = state.rows[index]!;
        const remotePayload = {
          ...current.payload!,
          title: `Remote storm ${state.stormSequence}`,
          content: `Remote mutation ${state.stormSequence}`,
          updatedAt: Number(current.payload?.updatedAt ?? 1) + state.stormSequence,
          revision: Number(current.payload?.revision ?? 1) + 1,
        };
        state.rows[index] = {
          ...current,
          payload: remotePayload,
          payload_hash: payloadHash(remotePayload),
          client_updated_at: state.stormSequence,
          deleted_at: null,
          version: current.version + 1,
          updated_at: new Date().toISOString(),
        };
        return json(route, []);
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

async function openReady(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function synchronize(page: Page) {
  return page.evaluate(
    async (value) =>
      (await import('/notes/src/features/sync/syncEngine.ts')).synchronizeNotes(value),
    session,
  );
}

async function createFixedNote(
  page: Page,
  options: { id: string; title: string; content: string; timestamp: number },
) {
  return page.evaluate(async (value) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase, {
      idFactory: () => value.id,
      clock: () => value.timestamp,
    });
    return repository.create({ title: value.title, content: value.content });
  }, options);
}

test('three consecutive CAS races are bounded, preserve the local edit, and converge on a later sync', async ({
  page,
}) => {
  const state = createCloudState();
  await installCloud(page, state);
  await openReady(page);

  const note = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return new db.NotesRepository(db.notesDatabase).create({
      title: 'CAS storm',
      content: 'Baseline',
    });
  });
  await synchronize(page);

  await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase);
    const current = await repository.require(id);
    await repository.update(id, { title: 'Local survives storm', content: 'Keep this local edit' }, current.revision);
  }, note.id);

  state.stormNoteId = note.id;
  state.stormRemaining = 3;
  const stormResult = await synchronize(page);

  expect(state.stormSequence).toBe(3);
  expect(stormResult.failed).toBe(0);
  expect(stormResult.deferred).toBeGreaterThan(0);
  const duringStorm = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const current = await new db.NotesRepository(db.notesDatabase).require(id);
    const shadow = await db.notesDatabase.settings.get(`sync.supabase.shadow.v2:${'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}`);
    return { title: current.title, content: current.content, shadow: shadow?.value ?? null };
  }, note.id);
  expect(duringStorm.title).toBe('Local survives storm');
  expect(duringStorm.content).toBe('Keep this local edit');
  expect(state.rows.find((row) => row.entity_type === 'note' && row.entity_id === note.id)?.payload?.content).toBe(
    'Remote mutation 3',
  );

  state.stormNoteId = undefined;
  const recoveryResult = await synchronize(page);
+  expect(recoveryResult.failed).toBe(0);
  const remoteAfter = state.rows.find(
    (row) => row.entity_type === 'note' && row.entity_id === note.id,
  );
  expect(remoteAfter?.payload?.title).toBe('Local survives storm');
  expect(remoteAfter?.payload?.content).toBe('Keep this local edit');
  expect(remoteAfter?.version).toBe(5);
  expect(duringStorm.shadow).toBeTruthy();
});

test('navigator locks serialize simultaneous sync calls so one local create is uploaded once', async ({
  page,
}) => {
  const state = createCloudState();
  await installCloud(page, state);
  await openReady(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    await new db.NotesRepository(db.notesDatabase).create({
      title: 'One upload under lock',
      content: 'Concurrent sync calls share one device database.',
    });
  });

  const support = await page.evaluate(() => Boolean(navigator.locks));
  expect(support).toBe(true);
  const results = await page.evaluate(async (value) => {
    const sync = await import('/notes/src/features/sync/syncEngine.ts');
    return Promise.all([sync.synchronizeNotes(value), sync.synchronizeNotes(value)]);
  }, session);

  expect(state.posts).toBe(1);
  expect(state.rows.filter((row) => row.entity_type === 'note')).toHaveLength(1);
  expect(results.reduce((total, result) => total + result.failed, 0)).toBe(0);
});

test('an active checklist editor defers the parent and children until editing ends', async ({ page }) => {
  const state = createCloudState();
  await installCloud(page, state);
  await openReady(page);

  const created = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return new db.ChecklistsRepository(db.notesDatabase).create('Editing deferral', [
      { id: crypto.randomUUID(), text: 'Deferred child one', checked: false, parentId: null },
      { id: crypto.randomUUID(), text: 'Deferred child two', checked: false, parentId: null },
    ]);
  });
  await page.evaluate((noteId) => {
    const marker = document.createElement('div');
    marker.dataset.editingNote = noteId;
    marker.id = 'phase5-editing-marker';
    document.body.append(marker);
  }, created.note.id);

  const deferred = await synchronize(page);
  expect(deferred.deferred).toBeGreaterThanOrEqual(3);
  expect(state.posts).toBe(0);
  expect(state.rows).toHaveLength(0);

  await page.evaluate(() => document.querySelector('#phase5-editing-marker')?.remove());
  const released = await synchronize(page);
  expect(released.failed).toBe(0);
  expect(state.rows.filter((row) => row.entity_type === 'note')).toHaveLength(1);
  expect(state.rows.filter((row) => row.entity_type === 'checklist_item')).toHaveLength(2);
});

test('share capture rolls back note and attachment writes when the exact-once ledger cannot persist', async ({
  page,
}) => {
  await openReady(page);
  const result = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const shared = await import('/notes/src/features/notes/sharedCapture.ts');
    const data = new Blob(['transactional attachment'], { type: 'text/plain' });
    const bytes = await data.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const checksum = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const repository = new shared.SharedCaptureRepository(db.notesDatabase);
    const settings = db.notesDatabase.settings as unknown as {
      add: (...args: unknown[]) => Promise<unknown>;
    };
    const originalAdd = settings.add;
    settings.add = async () => {
      throw new DOMException('Simulated quota exhaustion', 'QuotaExceededError');
    };

    let rejected = false;
    try {
      await repository.commit('66666666-6666-4666-8666-666666666666', {
        title: 'Must roll back',
        content: 'No partial local capture may survive.',
        attachments: [
          {
            name: 'transaction.txt',
            mimeType: 'text/plain',
            size: data.size,
            checksum,
            data,
          },
        ],
      });
    } catch {
      rejected = true;
    } finally {
      settings.add = originalAdd;
    }

    return {
      rejected,
      noteCount: await db.notesDatabase.notes.where('title').equals('Must roll back').count(),
      attachmentCount: await db.notesDatabase.attachments.count(),
      ledger: await db.notesDatabase.settings.get(
        'internal.share-capture.v1:66666666-6666-4666-8666-666666666666',
      ),
    };
  });

  expect(result.rejected).toBe(true);
  expect(result.noteCount).toBe(0);
  expect(result.attachmentCount).toBe(0);
  expect(result.ledger).toBeUndefined();
});

test('two isolated device profiles converge after a conflicting same-id note while preserving the loser', async ({
  browser,
}) => {
  const state = createCloudState();
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await installCloud(pageA, state);
    await installCloud(pageB, state);
    await openReady(pageA);
    await openReady(pageB);
    await createFixedNote(pageA, {
      id: FIXED_NOTE_ID,
      title: 'Device A version',
      content: 'Created on device A',
      timestamp: 1_000,
    });
    await createFixedNote(pageB, {
      id: FIXED_NOTE_ID,
      title: 'Device B version',
      content: 'Created on device B',
      timestamp: 2_000,
    });

    await synchronize(pageA);
    const deviceBResult = await synchronize(pageB);
    expect(deviceBResult.conflicts).toBeGreaterThan(0);
    expect(deviceBResult.conflictCopies).toBeGreaterThan(0);
    await synchronize(pageA);

    const [deviceA, deviceB] = await Promise.all(
      [pageA, pageB].map((page) =>
        page.evaluate(async (id) => {
          const db = await import('/notes/src/db/index.ts');
          const current = await new db.NotesRepository(db.notesDatabase).require(id);
          const titles = (await db.notesDatabase.notes.toArray()).map((note) => note.title);
          return { title: current.title, content: current.content, titles };
        }, FIXED_NOTE_ID),
      ),
    );

    expect(deviceA.title).toBe('Device B version');
    expect(deviceA.content).toBe('Created on device B');
    expect(deviceB.title).toBe('Device B version');
    expect(deviceB.content).toBe('Created on device B');
    expect(deviceB.titles.some((title) => title.includes('conflict copy (cloud'))).toBe(true);
    const remote = state.rows.find(
      (row) => row.entity_type === 'note' && row.entity_id === FIXED_NOTE_ID,
    );
    expect(remote?.payload?.title).toBe('Device B version');
    expect(remote?.version).toBe(2);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});