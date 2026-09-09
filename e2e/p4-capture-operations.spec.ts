import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGO8E+DGwMDAwMDAxAADABrWAXZuhrHqAAAAAElFTkSuQmCC',
  'base64',
);

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

test('mobile New is a universal capture menu and drawing opens directly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await waitForNotes(page);

  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'New', exact: true });
  await expect(menu).toBeVisible();
  for (const name of ['Text note', 'Checklist', 'Image', 'Scan', 'Drawing', 'Voice']) {
    await expect(menu.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await menu.getByRole('button', { name: /^Drawing/ }).click();
  await expect(page.getByRole('dialog', { name: 'Drawing editor' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();
});

test('mobile universal capture can start an image note and a scan exposes local OCR', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await waitForNotes(page);

  await page.getByRole('button', { name: 'New note', exact: true }).click();
  let menu = page.getByRole('dialog', { name: 'New', exact: true });
  await menu.locator('input[type="file"][multiple]').setInputFiles({
    name: 'capture.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  let composer = page.getByRole('form', { name: 'New note' });
  await expect(composer.getByRole('button', { name: 'Open image: capture.png' })).toBeVisible();
  await composer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'New note', exact: true }).click();
  menu = page.getByRole('dialog', { name: 'New', exact: true });
  await menu.locator('input[type="file"][capture="environment"]').setInputFiles({
    name: 'scan.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  composer = page.getByRole('form', { name: 'New note' });
  await expect(composer.getByRole('button', { name: 'Open image: scan.png' })).toBeVisible();
  await expect(composer.getByRole('button', { name: 'Extract text' })).toBeVisible();
});

test('Shift+C opens checklist capture without navigating through menus', async ({ page }) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.keyboard.press('Shift+C');
  await expect(page.getByRole('form', { name: 'New checklist' })).toBeVisible();
});

test('checklist progress, duplicate, add-item, and completion controls stay coherent', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const composer = page.getByRole('form', { name: 'New checklist' });
  const first = composer.getByLabel('Checklist item 1');
  await first.fill('Alpha');
  await first.press('Enter');
  await composer.getByLabel('Checklist item 2').fill('Beta');

  await composer.locator('.checklist-row').first().hover();
  await composer.getByRole('button', { name: 'Duplicate item 1' }).click();
  await expect(composer.getByLabel('Checklist item 3')).toBeVisible();
  await expect(composer.getByLabel('Checklist progress')).toContainText('0 of 3 completed');

  await composer.getByRole('button', { name: 'Check all' }).click();
  await expect(composer.getByLabel('Checklist progress')).toContainText('3 of 3 completed');
  await expect(composer.getByRole('button', { name: 'Uncheck all' })).toBeVisible();

  await composer.getByRole('button', { name: 'Uncheck all' }).click();
  await composer.getByRole('button', { name: 'Add item' }).click();
  await expect(composer.getByLabel('Checklist item 4')).toBeFocused();
});

test('bulk selection exports selected notes as one Markdown ZIP', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: 'Export Alpha', content: 'Alpha body' });
    await notes.create({ title: 'Export Beta', content: 'Beta body' });
  });
  await page.reload();
  await waitForNotes(page);

  const firstCard = page.locator('[data-note-card]').first();
  await firstCard.hover();
  await firstCard.getByRole('button', { name: /^Select note:/ }).click();
  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await toolbar.getByRole('button', { name: 'Select all 2' }).click();

  const downloadPromise = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'Export selected notes as Markdown' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.zip$/u);
  await expect(page.getByText('Exported 2 notes as Markdown.')).toBeVisible();
});
