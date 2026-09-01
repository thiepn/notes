import { expect, test } from '@playwright/test';

test('rich text formats, previews, persists, renders on cards, and stays searchable', async ({
  page,
}) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill('Rich text note');

  const body = composer.getByLabel('Note text');
  await body.fill('Alpha beta\nSecond line');
  await body.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(6, 10);
  });
  await composer.getByRole('button', { name: 'Show formatting' }).click();
  await composer.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
  await expect(body).toHaveValue('Alpha **beta**\nSecond line');

  await body.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    const start = textarea.value.indexOf('Second line');
    textarea.focus();
    textarea.setSelectionRange(start, textarea.value.length);
  });
  await composer.getByRole('button', { name: 'Bulleted list' }).click();
  await expect(body).toHaveValue('Alpha **beta**\n- Second line');

  await composer.getByRole('button', { name: 'Preview formatted text' }).click();
  const preview = composer.getByRole('region', { name: 'Formatted preview' });
  await expect(preview.getByText('beta')).toHaveJSProperty('tagName', 'STRONG');
  await expect(preview.getByText('Second line')).toBeVisible();

  await composer.getByRole('button', { name: 'Edit formatted text' }).click();
  await composer.getByRole('button', { name: 'Close' }).click();

  const card = page.locator('[data-note-card]').filter({ hasText: 'Rich text note' });
  await expect(card).toBeVisible();
  await expect(card.locator('strong')).toHaveText('beta');
  await expect(card.getByText('Second line')).toBeVisible();
  await expect(card).not.toContainText('**beta**');

  const stored = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const note = (await db.notesDatabase.notes.toArray()).find(
      (item) => item.title === 'Rich text note',
    );
    return note?.content ?? null;
  });
  expect(stored).toBe('Alpha **beta**\n- Second line');

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('beta');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  await expect(
    page.locator('[data-note-card]').filter({ hasText: 'Rich text note' }),
  ).toBeVisible();
});

test('keyboard shortcuts apply inline formatting without closing the editor', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a text note' }).click();

  const composer = page.getByRole('form', { name: 'New note' });
  const body = composer.getByLabel('Note text');
  await body.fill('Shortcut');
  await body.selectText();
  await page.keyboard.press('ControlOrMeta+i');

  await expect(body).toHaveValue('*Shortcut*');
  await expect(composer).toBeVisible();
});
