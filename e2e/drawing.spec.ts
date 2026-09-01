import { expect, test, type Locator, type Page } from '@playwright/test';

async function drawStroke(page: Page, canvas: Locator) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Drawing canvas has no layout box.');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.78, box.y + box.height * 0.32, { steps: 6 });
  await page.mouse.up();
}

test('quick drawing creates an attachment-only note and persists a PNG', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Add drawing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing editor' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();

  const save = dialog.getByRole('button', { name: 'Save drawing' });
  await expect(save).toBeDisabled();
  const canvas = dialog.getByLabel('Drawing canvas');
  await drawStroke(page, canvas);
  await expect(save).toBeEnabled();

  await dialog.getByRole('button', { name: 'Undo drawing stroke' }).click();
  await expect(save).toBeDisabled();
  await dialog.getByRole('button', { name: 'Redo drawing stroke' }).click();
  await expect(save).toBeEnabled();

  await dialog.getByRole('button', { name: 'Pen color #c5221f' }).click();
  await dialog.getByRole('button', { name: 'Stroke width 14' }).click();
  await drawStroke(page, canvas);
  await save.click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole('region', { name: 'Attachments' })).toContainText('1 attachment');

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await db.notesDatabase.notes.toArray();
    const attachments = await db.notesDatabase.attachments.toArray();
    const attachment = attachments[0];
    if (!attachment) return null;
    const bitmap = await createImageBitmap(attachment.data);
    const result = {
      noteCount: notes.length,
      title: notes[0]?.title ?? null,
      content: notes[0]?.content ?? null,
      mimeType: attachment.mimeType,
      name: attachment.name,
      size: attachment.size,
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    return result;
  });

  expect(stored).toMatchObject({
    noteCount: 1,
    title: '',
    content: '',
    mimeType: 'image/png',
    width: 1200,
    height: 800,
  });
  expect(stored?.name).toMatch(/^drawing-.*\.png$/u);
  expect(stored?.size ?? 0).toBeGreaterThan(1000);

  await page.getByRole('form', { name: 'New note' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-note-card]')).toHaveCount(1);
  await expect(page.locator('[data-note-card] img')).toBeVisible();
});

test('drawing Escape closes only the drawing modal and existing notes can attach sketches', async ({
  page,
}) => {
  await page.goto('./');
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    return (await notes.create({ title: 'Sketch target', content: 'Keep this editor open.' })).id;
  });
  await page.reload();

  const card = page.locator(`[data-note-id="${noteId}"]`);
  await card.locator('.note-card-open').click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: 'Add drawing' }).click();
  await expect(page.getByRole('dialog', { name: 'Drawing editor' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Drawing editor' })).toHaveCount(0);
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: 'Add drawing' }).click();
  const drawing = page.getByRole('dialog', { name: 'Drawing editor' });
  await drawing.getByRole('button', { name: 'Eraser' }).click();
  await expect(drawing.getByRole('button', { name: 'Eraser' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drawing.getByRole('button', { name: 'Pen' }).click();
  await drawStroke(page, drawing.getByLabel('Drawing canvas'));
  await drawing.getByRole('button', { name: 'Save drawing' }).click();
  await expect(drawing).toHaveCount(0);

  const attachmentCount = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return db.notesDatabase.attachments.where('noteId').equals(id).count();
  }, noteId);
  expect(attachmentCount).toBe(1);
  await expect(editor.getByRole('region', { name: 'Attachments' })).toContainText('1 attachment');
});

test('checklist editors expose the same drawing attachment workflow', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const form = page.getByRole('form', { name: 'New checklist' });
  await form.getByLabel('Checklist title').fill('Sketch checklist');
  await form.getByLabel('Checklist item 1').fill('First item');
  await form.getByRole('button', { name: 'Close' }).click();

  const card = page.locator('[data-note-type="checklist"]').filter({ hasText: 'Sketch checklist' });
  await card.getByRole('button', { name: 'Open note: Sketch checklist' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await editor.getByRole('button', { name: 'Add drawing' }).click();

  const drawing = page.getByRole('dialog', { name: 'Drawing editor' });
  await drawStroke(page, drawing.getByLabel('Drawing canvas'));
  await drawing.getByRole('button', { name: 'Save drawing' }).click();
  await expect(drawing).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('region', { name: 'Attachments' })).toContainText('1 attachment');
});
