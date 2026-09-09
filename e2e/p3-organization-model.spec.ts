import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

function sidebarCount(page: Page, label: string) {
  return page
    .getByTestId('app-sidebar')
    .getByRole('button', { name: label, exact: true })
    .locator('.nav-count');
}

test('global capture preserves the active label collection', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);
  const labelId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const labels = new db.LabelsRepository(db.notesDatabase);
    return (await labels.create('Ideas')).id;
  });
  await page.reload();
  await waitForNotes(page);

  await page.getByTestId('app-sidebar').getByRole('button', { name: 'Ideas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();

  await page
    .getByTestId('app-sidebar')
    .getByRole('button', { name: 'Write a new note', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill('Captured in Ideas');
  await composer.getByLabel('Note text').fill('Global capture should keep collection context.');
  await composer.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open note: Captured in Ideas' })).toBeVisible();

  const assigned = await page.evaluate(
    async ({ expectedLabelId }) => {
      const db = await import('/notes/src/db/index.ts');
      const notes = new db.NotesRepository(db.notesDatabase);
      const labels = new db.LabelsRepository(db.notesDatabase);
      const note = (await notes.listActive()).find((item) => item.title === 'Captured in Ideas');
      return note ? (await labels.labelIdsForNote(note.id)).includes(expectedLabelId) : false;
    },
    { expectedLabelId: labelId },
  );
  expect(assigned).toBe(true);
});

test('search lifecycle changes refresh global collection counts immediately', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: 'Search lifecycle count', content: 'Count refresh.' })).id;
  });
  await page.reload();
  await waitForNotes(page);

  await expect(sidebarCount(page, 'Notes')).toHaveText('1');
  await expect(sidebarCount(page, 'Archive')).toHaveText('0');

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('Search lifecycle count');
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card).toBeVisible();
  await card.hover();
  await card.getByRole('button', { name: 'Archive note: Search lifecycle count' }).click();

  await expect(sidebarCount(page, 'Notes')).toHaveText('0');
  await expect(sidebarCount(page, 'Archive')).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Archived', level: 2 })).toBeVisible();
});

test('label management exposes usage and refreshes an already-open search index', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const note = await notes.create({ title: 'Catalog note', content: 'Label catalog refresh.' });
    const names = ['OriginalLabel', 'Ideas', 'Church', 'Study', 'Travel', 'Reference'];
    const created = [];
    for (const name of names) created.push(await labels.create(name));
    const original = created.find((label) => label.name === 'OriginalLabel');
    if (!original) throw new Error('Missing seeded label.');
    await labels.assign(note.id, original.id);
    return note.id;
  });
  await page.reload();
  await waitForNotes(page);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('OriginalLabel');
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  await page.getByRole('button', { name: 'Edit labels' }).click();
  const manager = page.getByRole('dialog', { name: 'Edit labels' });
  await expect(manager.getByRole('searchbox', { name: 'Find labels' })).toBeVisible();
  const originalRow = manager.locator('.label-manager-row').filter({ hasText: 'OriginalLabel' });
  await expect(originalRow.locator('.label-manager-meta')).toHaveText('1 note');
  await manager.getByRole('searchbox', { name: 'Find labels' }).fill('original');
  await expect(manager.locator('.label-manager-row')).toHaveCount(1);
  await manager.getByRole('button', { name: 'Rename label OriginalLabel' }).click();
  await manager.getByLabel('Rename label OriginalLabel').fill('RenamedLabel');
  await manager.getByRole('button', { name: 'Save label OriginalLabel' }).click();
  await manager.getByRole('button', { name: 'Close label manager' }).click();

  await expect(page.locator(`[data-note-id="${noteId}"]`)).toHaveCount(0);
  await search.fill('RenamedLabel');
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();
});

test('Trash supports restore all with undo and explicit empty-trash deletion', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    for (const title of ['Trash one', 'Trash two', 'Trash three']) {
      const note = await notes.create({ title, content: 'P3 trash management.' });
      await notes.trash(note.id, note.revision);
    }
  });
  await page.reload();
  await waitForNotes(page);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Restore all' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Trash is empty', level: 2 })).toBeVisible();
  await expect(sidebarCount(page, 'Notes')).toHaveText('3');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(3);
  await expect(sidebarCount(page, 'Trash')).toHaveText('3');

  await page.getByRole('button', { name: 'Empty trash' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Empty trash?' });
  await expect(dialog).toContainText('3 notes in Trash will be permanently deleted');
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('heading', { name: 'Trash is empty', level: 2 })).toBeVisible();
  await expect(sidebarCount(page, 'Trash')).toHaveText('0');

  expect(
    await page.evaluate(async () => {
      const db = await import('/notes/src/db/index.ts');
      return (await new db.NotesRepository(db.notesDatabase).listTrashed()).length;
    }),
  ).toBe(0);
});
