import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { RemoteSyncRecord, SupabaseSession } from '../src/features/sync/supabaseApi';

const HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session: SupabaseSession = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'p6@example.com' },
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

function replaceRemote(
  rows: RemoteSyncRecord[],
  type: RemoteSyncRecord['entity_type'],
  id: string,
  payload: Record<string, unknown>,
  updatedAt: number,
) {
  const index = rows.findIndex((row) => row.entity_type === type && row.entity_id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  const current = rows[index]!;
  rows[index] = {
    ...current,
    payload,
    payload_hash: hash(payload),
    client_updated_at: updatedAt,
    deleted_at: null,
    updated_at: new Date(updatedAt).toISOString(),
  };
}

async function cloud(page: Page, rows: RemoteSyncRecord[]) {
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
        const record = request.postDataJSON() as RemoteSyncRecord;
        const index = rows.findIndex(
          (row) => row.entity_type === record.entity_type && row.entity_id === record.entity_id,
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

async function waitForNotes(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

test('a losing cloud text edit is preserved as a visible conflict copy', async ({ page }) => {
  const rows: RemoteSyncRecord[] = [];
  await cloud(page, rows);
  await waitForNotes(page);

  const note = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return new db.NotesRepository(db.notesDatabase).create({
      title: 'P6 Shared Draft',
      content: 'Original text',
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open note: P6 Shared Draft' })).toBeVisible();
  await sync(page);

  const localWinner = await page.evaluate(async (noteId) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase);
    const current = await repository.require(noteId);
    return repository.update(noteId, { content: 'Local winning text.' }, current.revision);
  }, note.id);

  const remoteBefore = rows.find((row) => row.entity_type === 'note' && row.entity_id === note.id)!;
  const remoteTime = Math.max(0, localWinner.updatedAt - 1);
  replaceRemote(
    rows,
    'note',
    note.id,
    {
      ...remoteBefore.payload!,
      content: 'Cloud losing text.',
      updatedAt: remoteTime,
      revision: localWinner.revision,
    },
    remoteTime,
  );

  const result = await sync(page);
  expect(result.conflicts).toBeGreaterThan(0);
  expect(result.conflictCopies).toBe(1);

  const state = await page.evaluate(async (noteId) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase);
    const active = await repository.listActive();
    return {
      original: await repository.require(noteId),
      copies: active.filter((candidate) => candidate.title.includes('conflict copy (cloud')),
    };
  }, note.id);
  expect(state.original.content).toBe('Local winning text.');
  expect(state.copies).toHaveLength(1);
  expect(state.copies[0]?.content).toBe('Cloud losing text.');
  await expect(
    page.getByRole('button', { name: /Open note: .*conflict copy \(cloud/u }),
  ).toBeVisible();
});

test('a losing local checklist edit preserves nested items in a conflict copy', async ({
  page,
}) => {
  const rows: RemoteSyncRecord[] = [];
  await cloud(page, rows);
  await waitForNotes(page);

  const created = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    return new db.ChecklistsRepository(db.notesDatabase).create('P6 Shared Checklist', [
      { id: parentId, text: 'Original parent', checked: false, parentId: null },
      { id: childId, text: 'Original child', checked: false, parentId },
    ]);
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open note: P6 Shared Checklist' })).toBeVisible();
  await sync(page);

  const localLoser = await page.evaluate(async (noteId) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.ChecklistsRepository(db.notesDatabase);
    const items = await repository.itemsForNote(noteId);
    const parent = items[0]!;
    const child = items[1]!;
    return repository.save(noteId, 'P6 Local Checklist Edit', [
      { id: parent.id, text: 'Local parent losing', checked: true, parentId: null },
      { id: child.id, text: 'Local child losing', checked: false, parentId: parent.id },
    ]);
  }, created.note.id);

  const remoteTime = localLoser.note.updatedAt + 1_000;
  const remoteNote = rows.find(
    (row) => row.entity_type === 'note' && row.entity_id === created.note.id,
  )!;
  replaceRemote(
    rows,
    'note',
    created.note.id,
    {
      ...remoteNote.payload!,
      title: 'P6 Cloud Checklist Winner',
      updatedAt: remoteTime,
      revision: localLoser.note.revision + 1,
    },
    remoteTime,
  );

  const remoteParent = rows.find(
    (row) => row.entity_type === 'checklist_item' && row.entity_id === created.items[0]!.id,
  )!;
  replaceRemote(
    rows,
    'checklist_item',
    created.items[0]!.id,
    {
      ...remoteParent.payload!,
      text: 'Cloud parent winner',
      checked: false,
      updatedAt: remoteTime,
    },
    remoteTime,
  );

  const result = await sync(page);
  expect(result.conflicts).toBeGreaterThanOrEqual(2);
  expect(result.conflictCopies).toBe(1);

  const state = await page.evaluate(async (originalId) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const checklists = new db.ChecklistsRepository(db.notesDatabase);
    const active = await notes.listActive();
    const copy = active.find((note) => note.title.includes('conflict copy (this device')) ?? null;
    return {
      original: await notes.require(originalId),
      originalItems: await checklists.itemsForNote(originalId),
      copy,
      copyItems: copy ? await checklists.itemsForNote(copy.id) : [],
    };
  }, created.note.id);

  expect(state.original.title).toBe('P6 Cloud Checklist Winner');
  expect(state.originalItems[0]?.text).toBe('Cloud parent winner');
  expect(state.copy?.title).toContain('P6 Local Checklist Edit');
  expect(state.copyItems.map((item) => item.text)).toEqual([
    'Local parent losing',
    'Local child losing',
  ]);
  expect(state.copyItems[0]?.checked).toBe(true);
  expect(state.copyItems[1]?.parentId).toBe(state.copyItems[0]?.id);
});
