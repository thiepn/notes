import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedTextNote(page: Page, title = 'P23 text note') {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: noteTitle, content: 'Editor refinement content' });
  }, title);
  await page.reload();
  await waitForNotesWorkspace(page);
}

async function createChecklist(page: Page) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.getByRole('button', { name: 'Create a checklist' }).click();
  const form = page.getByRole('form', { name: 'New checklist' });
  await form.getByLabel('Checklist title').fill('P23 checklist');
  await form.getByLabel('Checklist item 1').fill('First item');
  await form.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Open note: P23 checklist' })).toBeVisible();
}

test.describe('P23 editor action surfaces', () => {
  test('text editor Add is a focus-managed dialog and More is a complete keyboard menu', async ({
    page,
  }) => {
    await seedTextNote(page);
    await page.getByRole('button', { name: 'Open note: P23 text note' }).click();

    const editor = page.getByRole('dialog', { name: 'Edit note' });
    const add = editor.getByRole('button', { name: 'Add', exact: true });
    await add.click();

    const addDialog = editor.getByRole('dialog', { name: 'Add to note' });
    await expect(addDialog).toBeVisible();
    await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(add).toHaveAttribute('aria-controls', /.+/u);
    await expect(addDialog.getByRole('button', { name: 'Image / attachment' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(addDialog).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(editor).toBeVisible();

    const more = editor.getByRole('button', { name: 'More', exact: true });
    await more.focus();
    await more.press('ArrowDown');

    const menu = editor.getByRole('menu', { name: 'More note actions' });
    const items = menu.getByRole('menuitem');
    await expect(menu).toBeVisible();
    await expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await expect(items.first()).toBeFocused();

    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(editor).toBeVisible();
  });

  test('checklist editor uses the same Add and More interaction contract', async ({ page }) => {
    await createChecklist(page);
    await page.getByRole('button', { name: 'Open note: P23 checklist' }).click();

    const editor = page.getByRole('dialog', { name: 'Edit checklist' });
    const add = editor.getByRole('button', { name: 'Add', exact: true });
    await add.click();

    const addDialog = editor.getByRole('dialog', { name: 'Add to checklist' });
    await expect(addDialog.getByRole('button', { name: 'Image / attachment' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(addDialog).toHaveCount(0);
    await expect(add).toBeFocused();

    const more = editor.getByRole('button', { name: 'More', exact: true });
    await more.focus();
    await more.press('ArrowUp');
    const menu = editor.getByRole('menu', { name: 'More checklist actions' });
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(editor).toBeVisible();
  });

  test('pointer or focus movement outside an editor popover dismisses only that surface', async ({
    page,
  }) => {
    await seedTextNote(page, 'P23 outside dismissal');
    await page.getByRole('button', { name: 'Open note: P23 outside dismissal' }).click();

    const editor = page.getByRole('dialog', { name: 'Edit note' });
    const add = editor.getByRole('button', { name: 'Add', exact: true });
    await add.click();
    await expect(editor.getByRole('dialog', { name: 'Add to note' })).toBeVisible();

    const body = editor.getByLabel('Edit note text');
    await body.click();
    await expect(editor.getByRole('dialog', { name: 'Add to note' })).toHaveCount(0);
    await expect(body).toBeFocused();
    await expect(editor).toBeVisible();
  });
});

test('capture busy state blocks Escape and competing capture actions', async ({ page }) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () => new Promise<string>(() => undefined),
      },
    });
  });

  await page.getByRole('button', { name: 'More capture options' }).click();
  const capture = page.getByRole('dialog', { name: 'New' });
  await capture.getByRole('button', { name: 'Clipboard' }).click();

  await expect(capture).toHaveAttribute('aria-busy', 'true');
  await expect(capture.getByRole('button', { name: 'Close new note menu' })).toBeDisabled();
  await expect(capture.getByRole('button', { name: 'Text note' })).toBeDisabled();
  await expect(capture.getByRole('button', { name: 'Checklist' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(capture).toBeVisible();
  await expect(capture).toHaveAttribute('aria-busy', 'true');
});
