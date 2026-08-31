import { expect, test, type Page } from '@playwright/test';

async function openNewChecklist(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  return page.getByRole('form', { name: 'New checklist' });
}

async function createChecklist(page: Page, title: string, items: string[]) {
  const form = await openNewChecklist(page);
  await form.getByLabel('Checklist title').fill(title);
  const first = form.getByLabel('Checklist item 1');
  await first.fill(items[0] ?? '');
  for (let index = 1; index < items.length; index += 1) {
    await form.getByLabel(`Checklist item ${index}`).press('Enter');
    await form.getByLabel(`Checklist item ${index + 1}`).fill(items[index] ?? '');
  }
  await form.getByRole('button', { name: 'Close' }).click();
  return page.locator('[data-note-type="checklist"]').filter({ hasText: title });
}

test('creates a checklist, previews it on the card, and persists all rows across reload', async ({
  page,
}) => {
  const card = await createChecklist(page, 'Groceries', ['Milk', 'Eggs', 'Bread']);
  await expect(card).toBeVisible();
  await expect(card.getByText('Milk', { exact: true })).toBeVisible();
  await expect(card.getByText('Eggs', { exact: true })).toBeVisible();

  await page.reload();
  const reloaded = page.locator('[data-note-type="checklist"]').filter({ hasText: 'Groceries' });
  await expect(reloaded).toBeVisible();

  const stored = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);
    const note = (await notes.listActive()).find((entry) => entry.title === 'Groceries');
    return note
      ? {
          type: note.type,
          items: (await checklists.itemsForNote(note.id)).map((item) => item.text),
        }
      : null;
  });
  expect(stored).toEqual({ type: 'checklist', items: ['Milk', 'Eggs', 'Bread'] });
});

test('Enter, Backspace, Tab nesting, and drag reorder persist correctly', async ({ page }) => {
  const card = await createChecklist(page, 'Structure', ['Parent', 'Child', 'Last']);
  await card.getByRole('button', { name: 'Open note: Structure' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit checklist' });

  await dialog.getByLabel('Checklist item 2').press('Tab');
  await expect(dialog.locator('.checklist-row').nth(1)).toHaveAttribute('data-depth', '1');

  const third = dialog.getByLabel('Checklist item 3');
  await third.fill('');
  await third.press('Backspace');
  await expect(dialog.locator('.checklist-item-input')).toHaveCount(2);

  const dragHandle = dialog.getByRole('button', { name: 'Drag item 2' });
  await dragHandle.dragTo(dialog.locator('.checklist-row').first());
  await expect(dialog.locator('.checklist-item-input').first()).toHaveValue('Child');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Open note: Structure' }).click();
  const reopened = page.getByRole('dialog', { name: 'Edit checklist' });
  await expect(reopened.locator('.checklist-item-input').first()).toHaveValue('Child');
});

test('completed controls move, hide, show, and clear checked items', async ({ page }) => {
  const card = await createChecklist(page, 'Done controls', ['First', 'Second', 'Third']);
  await card.getByRole('button', { name: 'Open note: Done controls' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit checklist' });

  await dialog.getByRole('checkbox', { name: 'Mark item 1 complete' }).check();
  await expect(dialog.locator('.checklist-item-input').last()).toHaveValue('First');
  await dialog.getByRole('button', { name: 'Hide completed (1)' }).click();
  await expect(dialog.locator('.checklist-item-input')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Show completed (1)' }).click();
  await expect(dialog.locator('.checklist-item-input')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Clear completed' }).click();
  await expect(dialog.locator('.checklist-item-input')).toHaveCount(2);
});

test('converts text notes to checklists and back without losing item text', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a text note' }).click();
  await page.getByLabel('Title').fill('Convert me');
  await page.getByLabel('Note text').fill('Alpha\nBeta\nGamma');
  await page.getByRole('form', { name: 'New note' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Open note: Convert me' }).click();
  const textDialog = page.getByRole('dialog', { name: 'Edit note' });
  await textDialog.getByRole('button', { name: 'Convert to checklist' }).click();

  const checklistDialog = page.getByRole('dialog', { name: 'Edit checklist' });
  await expect(checklistDialog.getByLabel('Checklist item 1')).toHaveValue('Alpha');
  await expect(checklistDialog.getByLabel('Checklist item 2')).toHaveValue('Beta');
  await expect(checklistDialog.getByLabel('Checklist item 3')).toHaveValue('Gamma');
  await checklistDialog.getByRole('button', { name: 'Convert to text' }).click();

  await page.getByRole('button', { name: 'Open note: Convert me' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit note' }).getByLabel('Edit note text'),
  ).toHaveValue('Alpha\nBeta\nGamma');
});

test('recovers an existing checklist edit after an immediate reload inside the autosave window', async ({
  page,
}) => {
  const card = await createChecklist(page, 'Recovery list', ['Original']);
  await card.getByRole('button', { name: 'Open note: Recovery list' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit checklist' });
  await dialog.getByLabel('Checklist item 1').fill('Recovered immediately');
  await page.reload();

  const recovered = page.getByRole('dialog', { name: 'Edit checklist' });
  await expect(recovered.getByLabel('Checklist item 1')).toHaveValue('Recovered immediately');
  await recovered.getByRole('button', { name: 'Close' }).click();

  const stored = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);
    const note = (await notes.listActive()).find((entry) => entry.title === 'Recovery list');
    return note ? (await checklists.itemsForNote(note.id))[0]?.text : null;
  });
  expect(stored).toBe('Recovered immediately');
});

test('persists a 100-item snapshot atomically across database reopen', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const name = `p7-checklist-${crypto.randomUUID()}`;
    const db = dbModule.createNotesDatabase(name);
    const repo = new dbModule.ChecklistsRepository(db);
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: crypto.randomUUID(),
      text: `Item ${index + 1}`,
      checked: index % 3 === 0,
      parentId: null,
    }));
    const created = await repo.create('Stress', items);
    db.close();

    const reopened = dbModule.createNotesDatabase(name);
    const reopenedRepo = new dbModule.ChecklistsRepository(reopened);
    const persisted = await reopenedRepo.itemsForNote(created.note.id);
    reopened.close();
    await dbModule.deleteNotesDatabase(name);
    return { count: persisted.length, first: persisted[0]?.text, last: persisted[99]?.text };
  });
  expect(result).toEqual({ count: 100, first: 'Item 1', last: 'Item 100' });
});
