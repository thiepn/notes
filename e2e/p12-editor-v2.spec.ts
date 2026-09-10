import { expect, test, type Page } from '@playwright/test';

async function openTextComposer(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('notes.onboarding.quickstart.v1', 'done');
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a text note' }).click();
  const form = page.getByRole('form', { name: 'New note' });
  await expect(form).toBeVisible();
  const body = form.getByRole('textbox', { name: 'Note text', exact: true });
  await expect(body).toBeFocused();
  return { form, body };
}

test.describe('P12 Editor V2', () => {
  test('slash commands create a heading without leaving the writing surface', async ({ page }) => {
    const { form, body } = await openTextComposer(page);

    await body.fill('/hea');
    const menu = form.getByRole('menu', { name: 'Insert block' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Heading/u })).toBeVisible();

    await body.press('Enter');
    await expect(body).toHaveValue('## ');
    await body.type('Workspace plan');
    await expect(body).toHaveValue('## Workspace plan');

    await form.getByRole('button', { name: 'Preview formatted text' }).click();
    await expect(form.locator('.rich-text-heading[data-level="2"]')).toHaveText('Workspace plan');
  });

  test('Enter continues bullet lists and a blank marker exits the list', async ({ page }) => {
    const { body } = await openTextComposer(page);

    await body.fill('- alpha');
    await body.press('End');
    await body.press('Enter');
    await expect(body).toHaveValue('- alpha\n- ');

    await body.type('beta');
    await body.press('Enter');
    await expect(body).toHaveValue('- alpha\n- beta\n- ');

    await body.press('Enter');
    await expect(body).toHaveValue('- alpha\n- beta\n');
    await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();
  });

  test('pasting a URL over selected text creates a Markdown link', async ({ page }) => {
    const { body } = await openTextComposer(page);

    await body.fill('Read the docs today');
    await body.evaluate((node) => {
      node.setSelectionRange(9, 13);
      node.dispatchEvent(new Event('select', { bubbles: true }));
    });

    await body.evaluate((node) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'https://example.com');
      node.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }),
      );
    });

    await expect(body).toHaveValue('Read the [docs](https://example.com) today');
  });

  test('session undo and redo reverse programmatic slash edits', async ({ page }) => {
    const { form, body } = await openTextComposer(page);

    await body.fill('/heading');
    await body.press('Enter');
    await expect(body).toHaveValue('## ');

    const undo = form.getByRole('button', { name: 'Undo' });
    const redo = form.getByRole('button', { name: 'Redo' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(body).toHaveValue('/heading');
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(body).toHaveValue('## ');
  });

  test('slash code command inserts an editable fenced code block', async ({ page }) => {
    const { form, body } = await openTextComposer(page);

    await body.fill('/code');
    const menu = form.getByRole('menu', { name: 'Insert block' });
    await expect(menu.getByRole('menuitem', { name: /Code block/u })).toBeVisible();
    await body.press('Enter');
    await expect(body).toHaveValue('```\ncode\n```');

    await body.type('const x = 1;');
    await expect(body).toHaveValue('```\nconst x = 1;\n```');

    await form.getByRole('button', { name: 'Preview formatted text' }).click();
    await expect(form.locator('.rich-text-code-block')).toContainText('const x = 1;');
  });

  test('Editor V2 controls remain touch-safe on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { form, body } = await openTextComposer(page);

    for (const label of ['Undo', 'Redo', 'Show formatting', 'Preview formatted text']) {
      const button = form.getByRole('button', { name: label });
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await body.fill('/');
    const firstCommand = form.getByRole('menu', { name: 'Insert block' }).getByRole('menuitem').first();
    const commandBox = await firstCommand.boundingBox();
    expect(commandBox).not.toBeNull();
    expect(commandBox!.height).toBeGreaterThanOrEqual(44);
  });
});
