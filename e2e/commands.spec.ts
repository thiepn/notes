import { expect, test, type Page } from '@playwright/test';

import { seedKeyboardLibrary, waitForNotesWorkspace } from './helpers/keyboard';

async function focusedNoteId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.closest('[data-note-card]')?.getAttribute('data-note-id') ?? null);
}

test('command palette opens with Ctrl+K and executes navigation and creation commands', async ({ page }) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('archive');
  await palette.getByRole('combobox', { name: 'Search commands' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();

  await page.keyboard.press('Control+K');
  const secondPalette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(secondPalette).toBeVisible();
  await secondPalette.getByRole('combobox', { name: 'Search commands' }).fill('new checklist');
  await secondPalette.getByRole('combobox', { name: 'Search commands' }).press('Enter');
  await expect(page.getByRole('form', { name: 'New checklist' })).toBeVisible();
});

test('C starts text capture while editor typing suppresses global shortcuts and keeps Ctrl+K local', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.keyboard.press('c');
  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer).toBeVisible();

  const body = composer.getByLabel('Note text');
  await expect(body).toBeFocused();
  await body.type('pcej#');
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
  await expect(body).toHaveValue('pcej#[link text](https://)');

  await composer.getByLabel('Title').fill('Shortcut suppression');
  await composer.getByRole('button', { name: 'Close' }).click();
  const card = page.locator('[data-note-card]').filter({ hasText: 'Shortcut suppression' });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-pinned', 'false');
});

test('J and K cycle focus through visible cards and Enter opens the focused note', async ({
  page,
}) => {
  await seedKeyboardLibrary(page);

  await page.keyboard.press('j');
  const firstFocused = await focusedNoteId(page);
  expect(firstFocused).toBeTruthy();

  await page.keyboard.press('j');
  const secondFocused = await focusedNoteId(page);
  expect(secondFocused).toBeTruthy();
  expect(secondFocused).not.toBe(firstFocused);

  await page.keyboard.press('k');
  expect(await focusedNoteId(page)).toBe(firstFocused);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
});
