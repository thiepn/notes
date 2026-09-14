import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedOrganizationLibrary(page: Page) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);

    await notes.create({ title: 'P26 label note', content: 'Organization interaction coverage.' });
    await labels.create('Study');
    await labels.create('French');
    await labels.create('Ideas');
    await labels.create('Reference');
    await labels.create('Work');
    await labels.create('Personal');
    await labels.create('Travel');
  });
  await page.reload();
  await waitForNotesWorkspace(page);
}

test('label manager keeps focus stable across create, rename, delete, and layered Escape', async ({
  page,
}) => {
  await seedOrganizationLibrary(page);

  const managerTrigger = page.getByRole('button', { name: 'Edit labels' });
  await managerTrigger.focus();
  await managerTrigger.click();

  const dialog = page.getByRole('dialog', { name: 'Edit labels' });
  const newLabel = dialog.getByLabel('New label name');
  await expect(newLabel).toBeFocused();

  await newLabel.fill('Created in P26');
  await dialog.getByRole('button', { name: 'Create label' }).click();
  await expect(dialog.getByText('Created in P26', { exact: true })).toBeVisible();
  await expect(newLabel).toBeFocused();

  let renameTrigger = dialog.getByRole('button', { name: 'Rename label Study' });
  await renameTrigger.click();
  const renameInput = dialog.getByLabel('Rename label Study');
  await expect(renameInput).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  renameTrigger = dialog.getByRole('button', { name: 'Rename label Study' });
  await expect(renameTrigger).toBeFocused();

  await renameTrigger.click();
  await dialog.getByLabel('Rename label Study').fill('Learning');
  await dialog.getByRole('button', { name: 'Save label Study' }).click();
  const renamedTrigger = dialog.getByRole('button', { name: 'Rename label Learning' });
  await expect(renamedTrigger).toBeFocused();

  let deleteTrigger = dialog.getByRole('button', { name: 'Delete label Learning' });
  await deleteTrigger.click();
  const cancelDelete = dialog.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancelDelete).toBeFocused();

  await page.keyboard.press('Escape');
  deleteTrigger = dialog.getByRole('button', { name: 'Delete label Learning' });
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  deleteTrigger = dialog.getByRole('button', { name: 'Delete label Learning' });
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Learning', { exact: true })).toHaveCount(0);
  await expect(newLabel).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(managerTrigger).toBeFocused();
});

test('large per-note label libraries are searchable and keep popover keyboard ownership', async ({
  page,
}) => {
  await seedOrganizationLibrary(page);

  const card = page.locator('[data-note-card]').filter({ hasText: 'P26 label note' }).first();
  const moreTrigger = card.getByRole('button', { name: 'More actions: P26 label note' });
  await moreTrigger.focus();
  await moreTrigger.press('ArrowDown');
  const menu = card.getByRole('menu', { name: 'Actions for P26 label note' });
  await menu.getByRole('menuitem', { name: 'Labels', exact: true }).click();

  const picker = card.getByRole('dialog', { name: 'Note labels' });
  const labelSearch = picker.getByRole('searchbox', { name: 'Find labels for note' });
  await expect(labelSearch).toBeFocused();
  await labelSearch.fill('French');

  const french = picker.getByLabel('Add label French: P26 label note');
  await expect(french).toBeVisible();
  await expect(picker.getByLabel('Add label Study: P26 label note')).toHaveCount(0);
  await french.check();
  await expect(card.getByText('French', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(moreTrigger).toBeFocused();
});

test('bulk color application closes the popover and returns focus to its trigger', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: 'P26 bulk first', content: 'First bulk note.' });
    await notes.create({ title: 'P26 bulk second', content: 'Second bulk note.' });
  });
  await page.reload();
  await waitForNotesWorkspace(page);

  await page
    .getByRole('button', { name: 'Open note: P26 bulk first' })
    .click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Open note: P26 bulk second' }).click();

  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  const colorTrigger = toolbar.getByRole('button', { name: 'Change color for selected notes' });
  await colorTrigger.click();
  const colorDialog = toolbar.getByRole('dialog', { name: 'Bulk note color' });
  const yellow = colorDialog.getByRole('button', { name: 'Set Yellow color on selected notes' });
  await expect(yellow).toBeFocused();
  await yellow.press('Enter');

  await expect(colorDialog).toHaveCount(0);
  await expect(colorTrigger).toBeFocused();
  await expect(toolbar).toContainText('2 selected');
  await expect(page.locator('[data-note-card][data-color="yellow"]')).toHaveCount(2);
});
