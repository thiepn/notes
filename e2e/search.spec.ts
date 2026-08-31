import { expect, test, type Page } from '@playwright/test';

async function seedSearchLibrary(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);

    const titleNote = await notes.create({
      title: 'Überblick Mission',
      content: 'Planning notes.',
    });
    const bodyNote = await notes.create({
      title: 'Coffee',
      content: 'Meet at the café after church.',
    });
    const linkNote = await notes.create({
      title: 'Reference',
      content: 'Read https://example.com/resource',
    });
    const checklist = await checklists.create('Groceries', [
      { id: crypto.randomUUID(), text: 'Milk', checked: false, parentId: null },
      { id: crypto.randomUUID(), text: 'Bread', checked: false, parentId: null },
    ]);
    const pinned = await notes.create({ title: 'Pinned study', content: 'Important.' });
    await notes.setPinned(pinned.id, true, pinned.revision);
    const archived = await notes.create({ title: 'Archived needle', content: 'Old research.' });
    await notes.archive(archived.id, archived.revision);
    const trashed = await notes.create({ title: 'Trash needle', content: 'Should never appear.' });
    await notes.trash(trashed.id, trashed.revision);

    const study = await labels.create('Bible Study');
    await labels.assign(bodyNote.id, study.id);

    await notes.update(checklist.note.id, { color: 'yellow' }, checklist.note.revision);
    await dbModule.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: titleNote.id,
      name: 'cover.png',
      mimeType: 'image/png',
      size: 1,
      checksum: 'search-test-image',
      data: new Blob(['x'], { type: 'image/png' }),
      createdAt: Date.now(),
    });

    return {
      titleNoteId: titleNote.id,
      bodyNoteId: bodyNote.id,
      checklistId: checklist.note.id,
      pinnedId: pinned.id,
      archivedId: archived.id,
      trashedId: trashed.id,
      linkNoteId: linkNote.id,
    };
  });
}

async function search(page: Page, query: string) {
  const input = page.getByRole('searchbox', { name: 'Search notes' });
  await input.fill(query);
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  return input;
}

test('slash focuses search and normalized queries match title, body, checklist, and labels', async ({
  page,
}) => {
  const ids = await seedSearchLibrary(page);

  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();

  await search(page, 'uberblick');
  await expect(page.locator(`[data-note-id="${ids.titleNoteId}"]`)).toBeVisible();

  await search(page, 'cafe');
  await expect(page.locator(`[data-note-id="${ids.bodyNoteId}"]`)).toBeVisible();

  await search(page, 'milk');
  await expect(page.locator(`[data-note-id="${ids.checklistId}"]`)).toBeVisible();

  await search(page, 'label:"Bible Study"');
  await expect(page.locator(`[data-note-id="${ids.bodyNoteId}"]`)).toBeVisible();
  await expect(page.getByText('1 result')).toBeVisible();
});

test('search includes archive, excludes trash, and supports operators', async ({ page }) => {
  const ids = await seedSearchLibrary(page);

  await search(page, 'needle');
  await expect(page.locator(`[data-note-id="${ids.archivedId}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.trashedId}"]`)).toHaveCount(0);

  await search(page, 'is:pinned');
  await expect(page.locator(`[data-note-id="${ids.pinnedId}"]`)).toBeVisible();
  await expect(page.getByText('1 result')).toBeVisible();

  await search(page, 'has:image');
  await expect(page.locator(`[data-note-id="${ids.titleNoteId}"]`)).toBeVisible();

  await search(page, 'has:link');
  await expect(page.locator(`[data-note-id="${ids.linkNoteId}"]`)).toBeVisible();
});

test('filter panel intersects type, status, color, and labels with the query', async ({ page }) => {
  const ids = await seedSearchLibrary(page);
  await page.getByRole('button', { name: 'Search filters' }).click();
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();

  const filters = page.getByRole('region', { name: 'Search filters' });
  await filters.getByLabel('Type').selectOption('checklist');
  await filters.getByRole('button', { name: 'Filter Yellow notes' }).click();
  await expect(page.locator(`[data-note-id="${ids.checklistId}"]`)).toBeVisible();
  await expect(page.getByText('1 result')).toBeVisible();

  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await filters.getByLabel('Status').selectOption('active');
  await filters.getByLabel('Bible Study').check();
  await expect(page.locator(`[data-note-id="${ids.bodyNoteId}"]`)).toBeVisible();
  await expect(page.getByText('1 result')).toBeVisible();
});

test('10k-note local index keeps the in-memory matcher below 100 ms', async ({ page }) => {
  await page.goto('./');
  const metrics = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repositoryModule = await import('/notes/src/features/search/searchRepository.ts');
    const engine = await import('/notes/src/features/search/searchEngine.ts');
    const types = await import('/notes/src/features/search/searchTypes.ts');

    const now = Date.now();
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      id: crypto.randomUUID(),
      type: 'text' as const,
      title: index === 9_999 ? 'Unique performance needle' : `Generated note ${index}`,
      content: `Synthetic local note body ${index}`,
      color: 'default' as const,
      createdAt: now + index,
      updatedAt: now + index,
      pinnedAt: null,
      archivedAt: null,
      trashedAt: null,
      position: 0,
      revision: 1,
    }));
    await dbModule.notesDatabase.notes.bulkAdd(rows);

    const repository = new repositoryModule.SearchRepository(dbModule.notesDatabase);
    const loadStart = performance.now();
    const index = await repository.loadIndex();
    const loadMs = performance.now() - loadStart;
    const searchStart = performance.now();
    const results = engine.searchDocuments(
      index,
      'unique performance needle',
      types.DEFAULT_SEARCH_FILTERS,
    );
    const searchMs = performance.now() - searchStart;
    return { count: index.length, resultCount: results.length, loadMs, searchMs };
  });

  expect(metrics.count).toBe(10_000);
  expect(metrics.resultCount).toBe(1);
  expect(metrics.searchMs).toBeLessThan(100);
  expect(metrics.loadMs).toBeLessThan(3_000);
});
