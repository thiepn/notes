import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

test('command palette quick-opens active and archived notes by title', async ({ page }) => {
  await page.goto('./');
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const created = await notes.create({ title: 'P5 Navigation Atlas', content: 'Quick-open target' });
    return created.id;
  });
  await page.reload();
  await waitForNotes(page);

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('navigation atlas');
  const target = palette.getByRole('option', { name: /Open note: P5 Navigation Atlas/u });
  await expect(target).toBeVisible();
  await target.click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByRole('textbox', { name: 'Edit title' })).toHaveValue('P5 Navigation Atlas');
  await expect(page.locator(`[data-editing-note="${noteId}"]`)).toBeVisible();
});

test('saved searches are runnable as smart collections from the command palette', async ({ page }) => {
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

  await page.keyboard.press('Control+K');
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

  const state = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const all = [...(await notes.listActive()), ...(await notes.listArchived())];
    return {
      targets: all.filter((note) => note.title === 'P5 Missing Target').length,
      sourceContent: (await notes.require(arguments[0] as string)).content,
    };
  }, sourceId);
  expect(state.targets).toBe(1);
  expect(state.sourceContent).toContain('[[P5 Missing Target]]');
});
