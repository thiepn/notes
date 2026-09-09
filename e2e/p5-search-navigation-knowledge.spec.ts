import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

test('command palette quick-opens active and archived notes by title', async ({ page }) => {
  await page.goto('./');
  const ids = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const active = await notes.create({
      title: 'P5 Navigation Atlas',
      content: 'Quick-open target',
    });
    const archived = await notes.create({
      title: 'P5 Archive Atlas',
      content: 'Archived quick-open target',
    });
    await notes.archive(archived.id, archived.revision);
    return { active: active.id, archived: archived.id };
  });
  await page.reload();
  await waitForNotes(page);

  await page.keyboard.press('Control+K');
  let palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('navigation atlas');
  let target = palette.getByRole('option', { name: /Open note: P5 Navigation Atlas/u });
  await expect(target).toBeVisible();
  await target.click();

  let editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByRole('textbox', { name: 'Edit title' })).toHaveValue(
    'P5 Navigation Atlas',
  );
  await expect(page.locator(`[data-editing-note="${ids.active}"]`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  await page.keyboard.press('Control+K');
  palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('archive atlas');
  target = palette.getByRole('option', { name: /Open note: P5 Archive Atlas/u });
  await expect(target).toBeVisible();
  await target.click();

  editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByRole('textbox', { name: 'Edit title' })).toHaveValue('P5 Archive Atlas');
  await expect(page.locator(`[data-editing-note="${ids.archived}"]`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
});

test('saved searches are runnable as smart collections from the command palette', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: 'P5 Smart Alpha', content: 'collection alpha' });
    await notes.create({ title: 'P5 Smart Beta', content: 'collection beta' });
  });
  await page.reload();
  await waitForNotes(page);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('P5 Smart Alpha');
  await page.getByRole('button', { name: 'Save search' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByRole('button', { name: 'Open command palette' }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('P5 Smart Alpha');
  const collection = palette.getByRole('option', { name: /Smart collection: P5 Smart Alpha/u });
  await expect(collection).toBeVisible();
  await collection.click();

  await expect(search).toHaveValue('P5 Smart Alpha');
  await expect(page.getByText('P5 Smart Alpha', { exact: true })).toBeVisible();
  await expect(page.getByText('P5 Smart Beta', { exact: true })).toHaveCount(0);
});

test('a missing WikiLink target can be created directly from Connections', async ({ page }) => {
  await page.goto('./');
  const sourceId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const created = await notes.create({
      title: 'P5 Link Source',
      content: 'Continue in [[P5 Missing Target]].',
    });
    return created.id;
  });
  await page.reload();
  await waitForNotes(page);

  await page.locator(`[data-note-id="${sourceId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'More' }).click();
  await editor.getByRole('menuitem', { name: /Connections/u }).click();

  const connections = editor.getByRole('region', { name: 'Connections' });
  await expect(connections.getByText('P5 Missing Target', { exact: true })).toBeVisible();
  await connections.getByRole('button', { name: 'Create note' }).click();

  const targetEditor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(targetEditor.getByRole('textbox', { name: 'Edit title' })).toHaveValue(
    'P5 Missing Target',
  );

  const state = await page.evaluate(async (sourceNoteId) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const all = [...(await notes.listActive()), ...(await notes.listArchived())];
    return {
      targets: all.filter((note) => note.title === 'P5 Missing Target').length,
      sourceContent: (await notes.require(sourceNoteId)).content,
    };
  }, sourceId);
  expect(state.targets).toBe(1);
  expect(state.sourceContent).toContain('[[P5 Missing Target]]');
});
