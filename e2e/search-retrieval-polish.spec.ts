import { expect, test, type Page } from '@playwright/test';

async function seedRetrievalLibrary(page: Page) {
  await page.goto('./');
  return page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);
    const checklists = new dbModule.ChecklistsRepository(dbModule.notesDatabase);

    const fuzzy = await notes.create({
      title: 'Missionary preparation',
      content: 'Language and field preparation.',
    });
    const attachment = await notes.create({
      title: 'Budget archive',
      content: 'Reference files.',
    });
    await dbModule.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: attachment.id,
      name: 'roadmap-budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1,
      checksum: 'v3-2-attachment',
      data: new Blob(['x']),
      createdAt: Date.now(),
    });
    const ocr = await notes.create({
      title: 'Travel scan',
      content: 'Photo\n\n## Extracted text\n\nFlight reservation AB123\nGate 7',
    });
    const checklist = await checklists.create('Packing list', [
      { id: crypto.randomUUID(), text: 'Passport', checked: false, parentId: null },
    ]);
    const work = await labels.create('Work');
    await labels.assign(checklist.note.id, work.id);

    return {
      fuzzyId: fuzzy.id,
      attachmentId: attachment.id,
      ocrId: ocr.id,
      checklistId: checklist.note.id,
    };
  });
}

async function fillSearch(page: Page, query: string) {
  const input = page.getByRole('searchbox', { name: 'Search notes' });
  await input.fill(query);
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  return input;
}

test('search results explain attachment, OCR, and fuzzy title matches', async ({ page }) => {
  const ids = await seedRetrievalLibrary(page);

  await fillSearch(page, 'roadmap budget');
  await expect(
    page.locator(`[data-note-id="${ids.attachmentId}"] .note-card-search-context`),
  ).toContainText('Attachment · roadmap-budget.xlsx');

  await fillSearch(page, 'reservation ab123');
  await expect(
    page.locator(`[data-note-id="${ids.ocrId}"] .note-card-search-context`),
  ).toContainText('OCR · Flight reservation AB123');

  await fillSearch(page, 'misionary');
  await expect(
    page.locator(`[data-note-id="${ids.fuzzyId}"] .note-card-search-context`),
  ).toContainText('Title · Missionary preparation');
});

test('ArrowDown enters results and closing a result restores retrieval focus', async ({ page }) => {
  const ids = await seedRetrievalLibrary(page);
  const input = await fillSearch(page, 'missionary');
  const result = page.locator(`[data-note-id="${ids.fuzzyId}"]`).getByRole('button', {
    name: 'Open note: Missionary preparation',
  });

  await input.press('ArrowDown');
  await expect(result).toBeFocused();
  await result.press('Enter');

  const editor = page.getByRole('dialog', { name: 'Edit note' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Close' }).click();
  await expect(result).toBeFocused();
});

test('active filter chips are individually removable and Escape unwinds search in stages', async ({
  page,
}) => {
  const ids = await seedRetrievalLibrary(page);
  await page.reload();

  const input = page.getByRole('searchbox', { name: 'Search notes' });
  await page.getByRole('button', { name: 'Search filters' }).click();
  const filters = page.getByRole('region', { name: 'Search filters' });
  await filters.getByLabel('Type').selectOption('checklist');
  await filters.getByLabel('Work').check();
  await expect(page.locator(`[data-note-id="${ids.checklistId}"]`)).toBeVisible();

  await expect(page.getByRole('button', { name: 'Remove filter Type: Checklist' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter Label: Work' })).toBeVisible();
  await expect(page.locator('.search-filter-count')).toHaveText('2');

  await page.getByRole('button', { name: 'Close search filters' }).first().click();
  await page.getByRole('button', { name: 'Remove filter Type: Checklist' }).click();
  await expect(page.getByRole('button', { name: 'Remove filter Type: Checklist' })).toHaveCount(0);
  await expect(page.locator('.search-filter-count')).toHaveText('1');

  await input.fill('passport');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove filter Label: Work' })).toBeVisible();

  await input.press('Escape');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.locator('.search-filter-count')).toHaveCount(0);
});

test('mobile filters open as a bottom sheet and can be dismissed explicitly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Search filters' }).click();

  const filters = page.getByRole('region', { name: 'Search filters' });
  await expect(filters).toBeVisible();
  expect(await filters.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeHidden();

  await filters.getByRole('button', { name: 'Close search filters' }).click();
  await expect(filters).toHaveCount(0);
});
