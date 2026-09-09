import { expect, test } from '@playwright/test';

function databaseName(): string {
  return `notes-p1-foundation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('P1 preserves every durable v3 record type and sync metadata across reopen', async ({
  page,
}) => {
  await page.goto('./');
  const name = databaseName();
  const result = await page.evaluate(async (databaseName) => {
    const db = await import('/notes/src/db/index.ts');
    const database = db.createNotesDatabase(databaseName);
    const now = 1_788_900_000_000;
    const noteId = 'p1-note';
    const labelId = 'p1-label';
    const attachmentBytes = new Uint8Array([80, 49, 45, 98, 108, 111, 98]);
    const syncShadow = JSON.stringify({
      userId: 'p1-user',
      entities: { 'note:p1-note': { localHash: 'abc', remoteHash: 'abc' } },
    });
    try {
      await database.open();
      await database.transaction(
        'rw',
        database.notes,
        database.checklistItems,
        database.labels,
        database.noteLabels,
        database.attachments,
        database.reminders,
        database.revisions,
        database.settings,
        async () => {
          await database.notes.put({
            id: noteId,
            type: 'checklist',
            title: 'Foundation note',
            content: 'Preserve me',
            color: 'blue',
            createdAt: now,
            updatedAt: now + 1,
            pinnedAt: now + 2,
            archivedAt: null,
            trashedAt: null,
            position: 7,
            revision: 3,
          });
          await database.checklistItems.put({
            id: 'p1-item',
            noteId,
            text: 'Durable item',
            checked: true,
            parentId: null,
            position: 0,
            createdAt: now,
            updatedAt: now + 1,
          });
          await database.labels.put({
            id: labelId,
            name: 'Foundation',
            nameNormalized: 'foundation',
            createdAt: now,
            updatedAt: now,
          });
          await database.noteLabels.put({ noteId, labelId, assignedAt: now + 3 });
          await database.attachments.put({
            id: 'p1-attachment',
            noteId,
            name: 'foundation.txt',
            mimeType: 'text/plain',
            size: attachmentBytes.byteLength,
            checksum: 'p1-checksum',
            data: new Blob([attachmentBytes], { type: 'text/plain' }),
            createdAt: now + 4,
          });
          await database.reminders.put({
            id: 'p1-reminder',
            noteId,
            dueAt: now + 86_400_000,
            timeZone: 'Europe/Berlin',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            dismissedAt: null,
            lastNotifiedAt: null,
          });
          await database.revisions.put({
            id: 'p1-revision',
            noteId,
            noteRevision: 3,
            reason: 'edit',
            payload: JSON.stringify({ title: 'Foundation note', content: 'Preserve me' }),
            createdAt: now + 5,
          });
          await database.settings.put({
            key: 'sync.supabase.shadow.v1',
            value: syncShadow,
            updatedAt: now + 6,
          });
        },
      );
      database.close();
      const reopened = db.createNotesDatabase(databaseName);
      await reopened.open();
      const [note, item, label, relation, attachment, reminder, revision, setting] =
        await Promise.all([
          reopened.notes.get(noteId),
          reopened.checklistItems.get('p1-item'),
          reopened.labels.get(labelId),
          reopened.noteLabels.get([noteId, labelId]),
          reopened.attachments.get('p1-attachment'),
          reopened.reminders.get('p1-reminder'),
          reopened.revisions.get('p1-revision'),
          reopened.settings.get('sync.supabase.shadow.v1'),
        ]);
      const bytes = attachment
        ? Array.from(new Uint8Array(await attachment.data.arrayBuffer()))
        : [];
      const version = reopened.verno;
      const tables = reopened.tables.map((table) => table.name).sort();
      reopened.close();
      return {
        version,
        tables,
        note,
        item,
        label,
        relation,
        attachment: attachment
          ? {
              id: attachment.id,
              checksum: attachment.checksum,
              size: attachment.size,
              name: attachment.name,
              mimeType: attachment.mimeType,
            }
          : null,
        bytes,
        reminder,
        revision,
        setting,
        syncShadow,
      };
    } finally {
      database.close();
      await db.deleteNotesDatabase(databaseName);
    }
  }, name);

  expect(result.version).toBe(3);
  expect(result.tables).toEqual([
    'attachments',
    'checklistItems',
    'labels',
    'noteLabels',
    'notes',
    'reminders',
    'revisions',
    'settings',
  ]);
  expect(result.note).toMatchObject({
    id: 'p1-note',
    title: 'Foundation note',
    content: 'Preserve me',
    revision: 3,
  });
  expect(result.item).toMatchObject({ id: 'p1-item', checked: true, text: 'Durable item' });
  expect(result.label).toMatchObject({ id: 'p1-label', name: 'Foundation' });
  expect(result.relation).toEqual({
    noteId: 'p1-note',
    labelId: 'p1-label',
    assignedAt: 1_788_900_000_003,
  });
  expect(result.attachment).toMatchObject({
    id: 'p1-attachment',
    checksum: 'p1-checksum',
    size: 7,
  });
  expect(result.bytes).toEqual([80, 49, 45, 98, 108, 111, 98]);
  expect(result.reminder).toMatchObject({
    id: 'p1-reminder',
    status: 'active',
    timeZone: 'Europe/Berlin',
  });
  expect(result.revision).toMatchObject({ id: 'p1-revision', noteRevision: 3, reason: 'edit' });
  expect(result.setting?.value).toBe(result.syncShadow);
});

test('P1 keeps device UI preferences intact across reload', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('notes.theme', 'dark');
    localStorage.setItem('notes.view-mode', 'list');
    localStorage.setItem('notes.sort-order', 'title-asc');
    localStorage.setItem('notes.active-section', 'archive');
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const values = await page.evaluate(() => ({
    theme: localStorage.getItem('notes.theme'),
    view: localStorage.getItem('notes.view-mode'),
    sort: localStorage.getItem('notes.sort-order'),
    section: localStorage.getItem('notes.active-section'),
  }));
  expect(values).toEqual({ theme: 'dark', view: 'list', sort: 'title-asc', section: 'archive' });
});

test('P1 medium header keeps search and global actions separated and reachable', async ({
  page,
}) => {
  for (const width of [768, 820, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
    const geometry = await page.locator('.app-header').evaluate((header) => {
      const search = header.querySelector('.search-shell')!.getBoundingClientRect();
      const actions = header.querySelector('.header-actions')!.getBoundingClientRect();
      return {
        searchRight: search.right,
        actionsLeft: actions.left,
        bodyWidth: document.body.scrollWidth,
        viewport: innerWidth,
      };
    });
    expect(geometry.searchRight + 8).toBeLessThanOrEqual(geometry.actionsLeft);
    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport);

    const filters = page.getByRole('button', { name: 'Search filters', exact: true });
    await filters.click();
    await expect(page.getByRole('region', { name: 'Search filters' })).toBeVisible();
    await filters.click();
    await expect(page.getByRole('region', { name: 'Search filters' })).toHaveCount(0);

    await expect(
      page.getByRole('button', { name: 'Open settings', exact: true }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Close settings' }).click();
  }
});
