import { expect, test } from '@playwright/test';

test('local OCR recognizes an attached image and appends reviewed text to a text note', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('./');

  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const attachments = new db.AttachmentsRepository(db.notesDatabase);
    const note = await notes.create({ title: 'OCR target', content: 'Existing body' });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 360;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 92px Arial, sans-serif';
    context.textBaseline = 'middle';
    context.fillText('HELLO OCR 2026', 90, 180);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Test image encoding failed');
    await attachments.addImages(note.id, [new File([blob], 'ocr-test.png', { type: 'image/png' })]);
    localStorage.setItem('notes.ocr.language', 'eng');
    return note.id;
  });

  await page.reload();
  await page.locator(`[data-note-id="${noteId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  const ocr = editor.getByRole('region', { name: 'Image text recognition' });
  await expect(ocr).toBeVisible();
  await ocr.getByRole('button', { name: 'Extract text' }).click();

  const dialog = page.getByRole('dialog', { name: 'Extract text from image' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Runs locally on this device')).toBeVisible();
  const extracted = dialog.getByLabel('Extracted text');
  await expect(extracted).toBeVisible({ timeout: 60_000 });
  await expect(extracted).toHaveValue(/HELLO/i);
  await expect(extracted).toHaveValue(/OCR/i);

  await extracted.fill('HELLO OCR 2026 corrected');
  await dialog.getByRole('button', { name: 'Add to note' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByLabel('Edit note text')).toHaveValue(
    /Existing body[\s\S]*## Extracted text[\s\S]*HELLO OCR 2026 corrected/u,
  );

  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(editor).toHaveCount(0);

  const storedContent = await page.evaluate(async (id) => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.get(id))?.content ?? null;
  }, noteId);
  expect(storedContent).toContain('## Extracted text');
  expect(storedContent).toContain('HELLO OCR 2026 corrected');
});

test('OCR is copy-only for checklist notes', async ({ page }) => {
  await page.goto('./');
  const noteId = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const checklists = new db.ChecklistsRepository(db.notesDatabase);
    const attachments = new db.AttachmentsRepository(db.notesDatabase);
    const created = await checklists.create('Checklist OCR', [
      { id: crypto.randomUUID(), text: 'Existing item', checked: false, parentId: null },
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    context.font = 'bold 48px Arial, sans-serif';
    context.fillText('COPY ONLY', 45, 105);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Test image encoding failed');
    await attachments.addImages(created.note.id, [
      new File([blob], 'checklist-ocr.png', { type: 'image/png' }),
    ]);
    return created.note.id;
  });

  await page.reload();
  await page.locator(`[data-note-id="${noteId}"] .note-card-open`).click();
  const editor = page.getByRole('dialog', { name: 'Edit checklist' });
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(editor.getByRole('region', { name: 'Image text recognition' })).toBeVisible();
});
