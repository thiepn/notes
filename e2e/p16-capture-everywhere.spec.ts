import { expect, test, type Page } from '@playwright/test';

async function openNewMenu(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'New note' }).click();
  const dialog = page.getByRole('dialog', { name: 'New' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('clipboard quick start creates and opens a prefilled note', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.evaluate(() => navigator.clipboard.writeText('Captured from the clipboard.'));

  const menu = await openNewMenu(page);
  await menu.getByRole('button', { name: 'Clipboard', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Edit note text')).toHaveValue('Captured from the clipboard.');
});

test('web link quick start validates and captures a bookmark with a useful title', async ({ page }) => {
  await page.goto('./');
  const menu = await openNewMenu(page);
  await menu.getByRole('button', { name: 'Web link', exact: true }).click();

  const linkDialog = page.getByRole('dialog', { name: 'Web link' });
  await linkDialog.getByLabel('Web address').fill('not a url');
  await linkDialog.getByRole('button', { name: 'Save link' }).click();
  await expect(linkDialog.getByRole('alert')).toContainText('valid http:// or https://');

  await linkDialog.getByLabel('Web address').fill('https://www.example.com/article');
  await linkDialog.getByRole('button', { name: 'Save link' }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByLabel('Edit title')).toHaveValue('example.com');
  await expect(editor.getByLabel('Edit note text')).toHaveValue('https://www.example.com/article');
});

test('templates create normal editable text notes with useful structure', async ({ page }) => {
  await page.goto('./');
  const menu = await openNewMenu(page);
  await menu.getByRole('button', { name: 'Template', exact: true }).click();

  const templateDialog = page.getByRole('dialog', { name: 'Templates' });
  await templateDialog.getByRole('button', { name: /Meeting/u }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor.getByLabel('Edit title')).toHaveValue(/^Meeting — \d{4}-\d{2}-\d{2}$/u);
  await expect(editor.getByLabel('Edit note text')).toContainText('## Agenda');
  await expect(editor.getByLabel('Edit note text')).toContainText('## Decisions');
  await expect(editor.getByLabel('Edit note text')).toContainText('## Actions');
});

test('prefilled capture inherits and stays inside the active label collection', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  const labelId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const labels = new db.LabelsRepository(db.notesDatabase);
    return (await labels.create('Inbox')).id;
  });
  await page.evaluate((id) => {
    localStorage.setItem('notes.active-section', 'notes');
    localStorage.setItem('notes.active-label', id);
  }, labelId);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  await page.evaluate(() => navigator.clipboard.writeText('Keep this inside Inbox.'));

  const menu = await openNewMenu(page);
  await menu.getByRole('button', { name: 'Clipboard', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  const noteId = await editor.getAttribute('data-editing-note');
  expect(noteId).toBeTruthy();
  await editor.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  if (!noteId) throw new Error('Expected captured note id.');
  await expect(page.locator(`[data-note-id="${noteId}"]`)).toBeVisible();

  const storedLabels = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    const labels = new db.LabelsRepository(db.notesDatabase);
    return labels.labelIdsForNote(id);
  }, noteId);
  expect(storedLabels).toContain(labelId);
});
