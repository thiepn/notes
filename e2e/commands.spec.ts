import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedKeyboardLibrary(page: Page) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  const ids = await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const notes = new dbModule.NotesRepository(dbModule.notesDatabase);
    const labels = new dbModule.LabelsRepository(dbModule.notesDatabase);

    const first = await notes.create({ title: 'Keyboard Alpha', content: 'First keyboard note.' });
    const second = await notes.create({ title: 'Keyboard Beta', content: 'Second keyboard note.' });
    const label = await labels.create('Keyboard Label');
    return { firstId: first.id, secondId: second.id, labelId: label.id };
  });
  await page.reload();
  await waitForNotesWorkspace(page);
  await expect(page.locator(`[data-note-id="${ids.firstId}"]`)).toBeVisible();
  await expect(page.locator(`[data-note-id="${ids.secondId}"]`)).toBeVisible();
  return ids;
}

async function focusedNoteId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.closest('[data-note-card]')?.getAttribute('data-note-id') ?? null,
  );
}

test('Ctrl+K opens a searchable command palette and runs navigation/create commands', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox', { name: 'Search commands' })).toBeFocused();

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

test('C starts text capture while editor typing suppresses global shortcuts and the palette chord', async ({
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
  await expect(body).toHaveValue('pcej#');

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
  expect(firstFocused).not.toBeNull();

  await page.keyboard.press('j');
  const secondFocused = await focusedNoteId(page);
  expect(secondFocused).not.toBeNull();
  expect(secondFocused).not.toBe(firstFocused);

  await page.keyboard.press('k');
  expect(await focusedNoteId(page)).toBe(firstFocused);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
});

test('focused-card P, #, E, and Delete shortcuts use normal card actions', async ({ page }) => {
  const ids = await seedKeyboardLibrary(page);
  const sidebar = page.getByTestId('app-sidebar');

  await page.keyboard.press('j');
  const targetId = await focusedNoteId(page);
  expect(targetId).not.toBeNull();
  const targetCard = page.locator(`[data-note-id="${targetId}"]`);

  await page.keyboard.press('p');
  await expect(targetCard).toHaveAttribute('data-pinned', 'true');

  await page.keyboard.press('j');
  const labelTargetId = await focusedNoteId(page);
  expect(labelTargetId).not.toBeNull();
  const labelTargetCard = page.locator(`[data-note-id="${labelTargetId}"]`);
  await page.keyboard.press('#');
  await expect(labelTargetCard.locator('.note-label-picker')).toBeVisible();
  await expect(labelTargetCard.getByLabel('Keyboard Label')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(labelTargetCard.locator('.note-label-picker')).toHaveCount(0);

  await page.keyboard.press('j');
  const archiveTargetId = await focusedNoteId(page);
  expect(archiveTargetId).not.toBeNull();
  await page.keyboard.press('e');
  await expect(page.locator(`[data-note-id="${archiveTargetId}"]`)).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator(`[data-note-id="${archiveTargetId}"]`)).toBeVisible();

  await page.keyboard.press('j');
  const trashTargetId = await focusedNoteId(page);
  expect(trashTargetId).not.toBeNull();
  await page.keyboard.press('Delete');
  await expect(page.locator(`[data-note-id="${trashTargetId}"]`)).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(page.locator(`[data-note-id="${trashTargetId}"]`)).toBeVisible();

  expect(ids.labelId).toBeTruthy();
});

test('command palette can open label management and focuses label creation', async ({ page }) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const input = palette.getByRole('combobox', { name: 'Search commands' });
  await input.fill('manage labels');
  await input.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Edit labels' })).toBeVisible();
  await expect(page.getByLabel('New label name')).toBeFocused();
});
