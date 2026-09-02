import { expect, test, type Page } from '@playwright/test';

async function seedTextNote(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: 'Editor feedback', content: '**Hello** world' })).id;
  });
}

async function createChecklist(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const form = page.getByRole('form', { name: 'New checklist' });
  await form.getByLabel('Checklist title').fill('Editor checklist');
  await form.getByLabel('Checklist item 1').fill('First');
  await form.getByLabel('Checklist item 1').press('Enter');
  await form.getByLabel('Checklist item 2').fill('Second');
  await form.getByLabel('Checklist item 2').press('Enter');
  await form.getByLabel('Checklist item 3').fill('Third');
  await form.getByRole('button', { name: 'Close' }).click();
  return page.locator('[data-note-type="checklist"]').filter({ hasText: 'Editor checklist' });
}

test('text editor exposes truthful save state, metrics, timestamp, and keyboard-close hint', async ({
  page,
}) => {
  const noteId = await seedTextNote(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open note: Editor feedback' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit note' });
  const status = dialog.locator('.note-editor-save-indicator');
  await expect(status).toHaveAttribute('data-state', 'saved');
  await expect(status).toHaveText('Saved');
  await expect(dialog.getByText('2 words', { exact: true })).toBeVisible();
  await expect(dialog.getByText('11 characters', { exact: true })).toBeVisible();
  await expect(dialog.locator('time.note-editor-updated')).toHaveAttribute('dateTime', /T/u);

  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
  await expect(close).toHaveAttribute('title', /Ctrl\/Cmd\+Enter/u);

  await dialog.getByLabel('Edit note text').fill('Hello brave new world');
  await expect(dialog.getByText('4 words', { exact: true })).toBeVisible();
  await expect(dialog.getByText('21 characters', { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await import('/notes/src/db/index.ts');
        return (await new db.NotesRepository(db.notesDatabase).require(id)).content;
      }, noteId),
    )
    .toBe('Hello brave new world');
  await expect(status).toHaveAttribute('data-state', 'saved');

  await dialog.getByLabel('Edit note text').press('Control+Enter');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByText('Hello brave new world', { exact: true })).toBeVisible();
});

test('checklist editor reports meaningful item and completion metrics with autosave state', async ({
  page,
}) => {
  const card = await createChecklist(page);
  await card.getByRole('button', { name: 'Open note: Editor checklist' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit checklist' });

  await expect(dialog.locator('.note-editor-save-indicator')).toHaveAttribute('data-state', 'saved');
  await expect(dialog.getByText('3 items', { exact: true })).toBeVisible();
  await expect(dialog.getByText('0 completed', { exact: true })).toBeVisible();

  await dialog.getByRole('checkbox', { name: 'Mark item 1 complete' }).check();
  await expect(dialog.getByText('3 items', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 completed', { exact: true })).toBeVisible();
  await expect(dialog.locator('.note-editor-save-indicator')).toHaveAttribute('data-state', 'saved');

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await new db.NotesRepository(db.notesDatabase).listActive();
    const note = notes.find((entry) => entry.title === 'Editor checklist');
    if (!note) return null;
    const items = await new db.ChecklistsRepository(db.notesDatabase).itemsForNote(note.id);
    return items.filter((item) => item.checked).length;
  });
  expect(stored).toBe(1);
});

test('recovered text edits settle back to a saved state without changing recovery semantics', async ({
  page,
}) => {
  const noteId = await seedTextNote(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open note: Editor feedback' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit note' });
  await dialog.getByLabel('Edit note text').fill('Recovered editor content');
  await page.reload();

  const recovered = page.getByRole('dialog', { name: 'Edit note' });
  await expect(recovered.getByLabel('Edit note text')).toHaveValue('Recovered editor content');
  await expect(recovered.locator('.note-editor-save-indicator')).toHaveAttribute('data-state', 'saved');
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await import('/notes/src/db/index.ts');
        return (await new db.NotesRepository(db.notesDatabase).require(id)).content;
      }, noteId),
    )
    .toBe('Recovered editor content');
});
