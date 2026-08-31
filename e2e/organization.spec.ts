import { expect, test, type Page } from '@playwright/test';

async function seedNote(page: Page, title: string) {
  await page.goto('./');
  return page.evaluate(async (noteTitle) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    const note = await repository.create({ title: noteTitle, content: 'Organization test note.' });
    return note.id;
  }, title);
}

async function createLabelInUi(page: Page, name: string) {
  await page.getByRole('button', { name: 'Edit labels' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit labels' });
  await dialog.getByLabel('New label name').fill(name);
  await dialog.getByRole('button', { name: 'Create label' }).click();
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close label manager' }).click();
}

async function hoverCard(page: Page, noteId: string) {
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await card.hover();
  return card;
}

test('label manager creates, renames, and deletes labels without deleting notes', async ({ page }) => {
  const noteId = await seedNote(page, 'Keep this note');
  await page.reload();
  await createLabelInUi(page, 'Study');

  let card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Change labels: Keep this note' }).click();
  await page.getByRole('dialog', { name: 'Note labels' }).getByLabel('Add label Study: Keep this note').check();
  await expect(card.getByText('Study', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit labels' }).click();
  let manager = page.getByRole('dialog', { name: 'Edit labels' });
  await manager.getByRole('button', { name: 'Rename label Study' }).click();
  await manager.getByLabel('Rename label Study').fill('Learning');
  await manager.getByRole('button', { name: 'Save label Study' }).click();
  await expect(manager.getByText('Learning', { exact: true })).toBeVisible();
  await manager.getByRole('button', { name: 'Close label manager' }).click();

  card = await hoverCard(page, noteId);
  await expect(card.getByText('Learning', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit labels' }).click();
  manager = page.getByRole('dialog', { name: 'Edit labels' });
  await manager.getByRole('button', { name: 'Delete label Learning' }).click();
  await manager.getByRole('button', { name: 'Delete', exact: true }).click();
  await manager.getByRole('button', { name: 'Close label manager' }).click();

  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Learning', exact: true })).toHaveCount(0);

  const stored = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    return {
      note: await notes.get(id),
      labelIds: await labels.labelIdsForNote(id),
    };
  }, noteId);
  expect(stored.note?.title).toBe('Keep this note');
  expect(stored.labelIds).toEqual([]);
});

test('label views persist and new notes created inside them inherit the label', async ({ page }) => {
  const noteId = await seedNote(page, 'Existing labeled note');
  await page.reload();
  await createLabelInUi(page, 'Ideas');

  let card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Change labels: Existing labeled note' }).click();
  await page
    .getByRole('dialog', { name: 'Note labels' })
    .getByLabel('Add label Ideas: Existing labeled note')
    .check();

  await page.getByRole('button', { name: 'Ideas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ideas', level: 1 })).toBeVisible();
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Created in Ideas');
  await page.getByLabel('Note text').fill('This note should inherit the current label.');
  await page.getByRole('form', { name: 'New note' }).getByRole('button', { name: 'Close' }).click();

  const createdCard = page.getByRole('button', { name: 'Open note: Created in Ideas' }).locator('..');
  await expect(createdCard.getByText('Ideas', { exact: true })).toBeVisible();

  const inherited = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const allNotes = await notes.listActive();
    const created = allNotes.find((note) => note.title === 'Created in Ideas');
    const allLabels = await labels.list();
    const ideas = allLabels.find((label) => label.name === 'Ideas');
    return created && ideas
      ? { noteId: created.id, labelIds: await labels.labelIdsForNote(created.id), labelId: ideas.id }
      : null;
  });
  expect(inherited).not.toBeNull();
  expect(inherited?.labelIds).toContain(inherited?.labelId);
});

test('note color changes persist across reloads', async ({ page }) => {
  const noteId = await seedNote(page, 'Color note');
  await page.reload();

  let card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Change color: Color note' }).click();
  await page.getByRole('dialog', { name: 'Note color' }).getByRole('button', {
    name: 'Set Yellow color: Color note',
  }).click();
  await expect(card).toHaveAttribute('data-color', 'yellow');

  await page.reload();
  card = page.locator(`[data-note-id="${noteId}"]`);
  await expect(card).toHaveAttribute('data-color', 'yellow');
});

test('a note can hold multiple labels', async ({ page }) => {
  const noteId = await seedNote(page, 'Multi label');
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    await labels.create('Study');
    await labels.create('Research');
  });
  await page.reload();

  const card = await hoverCard(page, noteId);
  await card.getByRole('button', { name: 'Change labels: Multi label' }).click();
  const picker = page.getByRole('dialog', { name: 'Note labels' });
  await picker.getByLabel('Add label Research: Multi label').check();
  await picker.getByLabel('Add label Study: Multi label').check();

  await expect(card.getByText('Research', { exact: true })).toBeVisible();
  await expect(card.getByText('Study', { exact: true })).toBeVisible();

  const labelCount = await page.evaluate(async (id) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    return (await labels.labelIdsForNote(id)).length;
  }, noteId);
  expect(labelCount).toBe(2);
});
