import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function seedNotebook(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
  const ids = await page.evaluate(async () => {
    const d = await import('/notes/src/db/index.ts');
    const notes = new d.NotesRepository(d.notesDatabase);
    const labels = new d.LabelsRepository(d.notesDatabase);
    const reading = await labels.create('Reading');
    const entries = [
      [
        'A place for unfinished thoughts',
        'Write the idea down before trying to organize it. A notebook should make room for thinking, not ask for a system first.',
      ],
      [
        'On learning a language',
        'Small conversations, repeated often.\n\n- Listen with attention\n- Ask better questions\n- Write one useful sentence',
      ],
      [
        'Reading for the weekend',
        '## The next chapter\n\nA few pages, a pencil, and enough time to follow an interesting thought.',
      ],
      [
        'Questions worth keeping',
        'What did I learn today?\nWhat still needs an answer?\nWhat should I try next?',
      ],
      [
        'A simpler workspace',
        'Keep the useful things within reach. Archive the rest without losing them.',
      ],
    ];
    const ids: string[] = [];
    for (const [title, content] of entries) {
      const note = await notes.create({ title: title!, content: content! });
      ids.push(note.id);
      if (title!.startsWith('Reading')) await labels.assign(note.id, reading.id);
    }
    await new d.ChecklistsRepository(d.notesDatabase).create('Before heading out', [
      { id: crypto.randomUUID(), text: 'Notebook and pen', checked: true, parentId: null },
      { id: crypto.randomUUID(), text: 'Water bottle', checked: false, parentId: null },
      { id: crypto.randomUUID(), text: 'Keys', checked: false, parentId: null },
    ]);
    return ids;
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }),
  ).toBeVisible();
  return ids;
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}

async function openResponsiveSettings(page: Page, width = page.viewportSize()?.width ?? 1440) {
  if (width <= 767) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'More navigation' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Settings', exact: true }).click();
  } else if (width <= 1100) {
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  }

  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

for (const theme of ['light', 'dark'])
  for (const width of [320, 390, 768, 1440]) {
    test(`V5 ${theme} notebook and account layout at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
      await page.addInitScript((value) => localStorage.setItem('notes.theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await seedNotebook(page);
      await noPageOverflow(page);
      await expect(page.getByLabel('Sort notes')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`notebook-${theme}-${width}.png`),
        fullPage: false,
      });
      const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
      if (width < 768) {
        await expect(mobile).toBeVisible();
        for (const button of await mobile.getByRole('button').all())
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } else await expect(mobile).toBeHidden();
      const dialog = await openResponsiveSettings(page, width);
      await dialog.getByRole('button', { name: /Account & sync/ }).click();
      const email = dialog.locator('input[type="email"]').first();
      await expect(email).toBeVisible();
      await email.scrollIntoViewIfNeeded();
      const bounds = await email.boundingBox();
      expect(bounds!.width).toBeGreaterThan(150);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const label = email.locator('..');
      const text = await label.locator('span').first().boundingBox();
      expect(text!.y + text!.height).toBeLessThanOrEqual(bounds!.y + 1);
      const lastAction = dialog.getByRole('button', { name: 'Resend verification', exact: true });
      await lastAction.scrollIntoViewIfNeeded();
      await expect(lastAction).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button', { name: 'Close settings' })).toBeInViewport({
        ratio: 1,
      });
      await noPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`account-${theme}-${width}.png`),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    });
  }

test('sort and list preference survive a reload without altering note content', async ({
  page,
}) => {
  await seedNotebook(page);
  await page.getByLabel('Sort notes').selectOption('title');
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  const titles = await page.locator('.note-card-title').allTextContents();
  expect(titles).toEqual(
    [...titles].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    ),
  );
  await page.reload();
  await expect(page.getByLabel('Sort notes')).toHaveValue('title');
  await expect(page.locator('.notes-board')).toHaveAttribute('data-view', 'list');
  await expect(page.locator('[data-note-card]')).toHaveCount(6);
});

test('cloud refresh preserves an active editor, draft, focus mode, and settings input', async ({
  page,
}) => {
  await seedNotebook(page);
  await page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note', exact: true });
  await editor.getByRole('textbox', { name: 'Edit note text' }).fill('My draft stays here.');
  await editor.getByRole('button', { name: 'Focus mode', exact: true }).click();
  await editor.evaluate((node) => node.setAttribute('data-identity-proof', 'same-editor'));
  await page.evaluate(async () => {
    const d = await import('/notes/src/db/index.ts');
    await new d.NotesRepository(d.notesDatabase).create({
      title: 'Arrived from another device',
      content: 'Incoming note',
    });
    window.dispatchEvent(new CustomEvent('notes-cloud-sync-applied'));
  });
  await expect(editor).toHaveAttribute('data-identity-proof', 'same-editor');
  await expect(editor).toHaveAttribute('data-focus', 'true');
  await expect(editor.getByRole('textbox', { name: 'Edit note text' })).toHaveValue(
    'My draft stays here.',
  );
  await expect(
    page.locator('.note-card-title').filter({ hasText: 'Arrived from another device' }),
  ).toHaveCount(1);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  const settings = await openResponsiveSettings(page);
  await settings.getByRole('button', { name: /Account & sync/ }).click();
  await settings.locator('input[type="email"]').fill('draft@example.com');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('notes-cloud-sync-applied')));
  await expect(settings.locator('input[type="email"]')).toHaveValue('draft@example.com');
});

test('Markdown download contains the current draft and focus mode does not reset it', async ({
  page,
}, testInfo) => {
  await seedNotebook(page);
  await page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note', exact: true });
  await editor.getByRole('textbox', { name: 'Edit title' }).fill('Notebook export');
  await editor
    .getByRole('textbox', { name: 'Edit note text' })
    .fill('**Current draft**\nBonjour 안녕하세요');
  await editor.getByRole('button', { name: 'Focus mode', exact: true }).click();
  await expect(editor).toHaveAttribute('data-focus', 'true');
  const downloaded = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Download Markdown' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('Notebook export.md');
  expect(await readFile((await file.path())!, 'utf8')).toBe(
    '# Notebook export\n\n**Current draft**\nBonjour 안녕하세요\n',
  );
  await page.screenshot({ path: testInfo.outputPath('writing-focus.png'), fullPage: false });
  await editor.getByRole('button', { name: 'Exit focus mode' }).click();
  await expect(editor.getByRole('textbox', { name: 'Edit note text' })).toHaveValue(
    '**Current draft**\nBonjour 안녕하세요',
  );
});

test('mobile navigation opens a contained drawer and returns to a working capture', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedNotebook(page);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'More navigation' });
  await expect(drawer).toBeVisible();
  await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await drawer.getByRole('button', { name: 'Hide navigation' }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const captureMenu = page.getByRole('dialog', { name: 'New', exact: true });
  await captureMenu.getByRole('button', { name: /^Text note/ }).click();
  const form = page.getByRole('form', { name: 'New note' });
  await form
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('A quick mobile thought');
  await form.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeFocused();
});

test('nested drawing traps Tab and Escape does not close its parent note', async ({ page }) => {
  await seedNotebook(page);
  await page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note', exact: true });
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await editor.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.getByRole('button', { name: 'Add drawing' }).click();
  const drawing = page.getByRole('dialog', { name: 'Drawing editor' });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await drawing.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawing).toHaveCount(0);
  await expect(editor).toBeVisible();
});

test('account action failures show an actionable alert instead of disappearing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://hycegznamzjhwinegaai.supabase.co/**', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ msg: 'Too many requests. Try again later.' }),
    }),
  );
  await page.goto('./');
  const dialog = await openResponsiveSettings(page);
  await dialog.getByRole('button', { name: /Account & sync/ }).click();
  await dialog.locator('input[type="email"]').fill('test@example.com');
  await dialog.getByRole('button', { name: 'Forgot password' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Too many requests');
  expect(errors).toEqual([]);
});
