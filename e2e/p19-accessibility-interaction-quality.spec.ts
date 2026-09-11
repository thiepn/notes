import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedNote(page: Page, title: string) {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: noteTitle, content: 'P19 accessibility regression content.' });
  }, title);
  await page.reload();
  await waitForNotesWorkspace(page);
}

test('note card More menu supports complete keyboard navigation and focus restoration', async ({
  page,
}) => {
  await seedNote(page, 'P19 keyboard note');

  const card = page.locator('[data-note-card]').filter({ hasText: 'P19 keyboard note' }).first();
  const trigger = card.getByRole('button', { name: 'More actions: P19 keyboard note' });
  await trigger.focus();
  await trigger.press('ArrowDown');

  const menu = card.getByRole('menu', { name: 'Actions for P19 keyboard note' });
  const items = menu.getByRole('menuitem');
  await expect(menu).toBeVisible();
  await expect(items.first()).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.press('ArrowUp');
  const reopened = card.getByRole('menu', { name: 'Actions for P19 keyboard note' });
  await expect(reopened.getByRole('menuitem').last()).toBeFocused();
});

test('note organization popovers receive focus and return it to their origin on Escape', async ({
  page,
}) => {
  await seedNote(page, 'P19 color note');

  const card = page.locator('[data-note-card]').filter({ hasText: 'P19 color note' }).first();
  const trigger = card.getByRole('button', { name: 'More actions: P19 color note' });
  await trigger.focus();
  await trigger.press('ArrowDown');
  const menu = card.getByRole('menu', { name: 'Actions for P19 color note' });
  await menu.getByRole('menuitem', { name: 'Color' }).click();

  const dialog = card.getByRole('dialog', { name: 'Note color' });
  await expect(dialog).toBeVisible();
  const directColorTrigger = card.locator('.note-card-direct-secondary').getByRole('button', {
    name: 'Change color: P19 color note',
    includeHidden: true,
  });
  await expect(directColorTrigger).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(directColorTrigger).toHaveAttribute('aria-controls', /note-color-panel-/);
  const firstColor = dialog.getByRole('button').first();
  await expect(firstColor).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('bulk selection announces count, exposes mixed labels, and restores popover focus', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const first = await notes.create({ title: 'P19 bulk first', content: 'First selected note' });
    await notes.create({ title: 'P19 bulk second', content: 'Second selected note' });
    const label = await labels.create('Partial label');
    await labels.assign(first.id, label.id);
  });
  await page.reload();
  await waitForNotesWorkspace(page);

  const first = page.getByRole('button', { name: 'Open note: P19 bulk first' });
  const second = page.getByRole('button', { name: 'Open note: P19 bulk second' });
  await first.click({ modifiers: ['Control'] });
  await second.click();

  const toolbar = page.getByRole('toolbar', { name: 'Selected notes actions' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[role="status"]')).toHaveText('2 notes selected');

  const trigger = toolbar.getByRole('button', { name: 'Change labels for selected notes' });
  await trigger.click();
  const dialog = toolbar.getByRole('dialog', { name: 'Bulk note labels' });
  const partial = dialog.getByRole('button', { name: 'Add label Partial label to selected notes' });
  await expect(partial).toHaveAttribute('aria-pressed', 'mixed');
  await expect(partial).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('capture source panels manage focus, validation semantics, and Back restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.getByRole('button', { name: 'New note', exact: true }).click();

  const root = page.getByRole('dialog', { name: 'New' });
  const template = root.getByRole('button', { name: 'Template' });
  await template.click();
  const templates = page.getByRole('dialog', { name: 'Templates' });
  const back = templates.getByRole('button', { name: 'Back' });
  await expect(back).toBeFocused();
  await back.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'New' }).getByRole('button', { name: 'Template' }),
  ).toBeFocused();

  const webLink = page
    .getByRole('dialog', { name: 'New' })
    .getByRole('button', { name: 'Web link' });
  await webLink.click();
  const linkDialog = page.getByRole('dialog', { name: 'Web link' });
  const input = linkDialog.getByRole('textbox', { name: 'Web address' });
  await expect(input).toBeFocused();
  await input.fill('not-a-web-address');
  await linkDialog.getByRole('button', { name: 'Save link' }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', 'capture-source-error');
  await expect(linkDialog.getByRole('alert')).toContainText(
    'Enter a valid http:// or https:// web address.',
  );

  await linkDialog.getByRole('button', { name: 'Back' }).click();
  await expect(
    page.getByRole('dialog', { name: 'New' }).getByRole('button', { name: 'Web link' }),
  ).toBeFocused();
});

test('mobile navigation returns focus to its opener after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await waitForNotesWorkspace(page);

  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const sidebar = page.getByRole('dialog', { name: 'More navigation' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Hide navigation' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'More navigation' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
