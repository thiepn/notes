import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function seedNotebook(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a text note' }).waitFor();
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const labels = new db.LabelsRepository(db.notesDatabase);
    const label = await labels.create('Reading');
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
    for (const [title, content] of entries) {
      const note = await notes.create({ title, content });
      if (title.startsWith('Reading')) await labels.assign(note.id, label.id);
    }
    const checklist = new db.ChecklistsRepository(db.notesDatabase);
    await checklist.create('Before heading out', [
      {
        id: crypto.randomUUID(),
        text: 'Notebook and pen',
        checked: true,
        parentId: null,
      },
      {
        id: crypto.randomUUID(),
        text: 'Water bottle',
        checked: false,
        parentId: null,
      },
      { id: crypto.randomUUID(), text: 'Keys', checked: false, parentId: null },
    ]);
  });
  await page.reload();
  await page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }).waitFor();
}

async function noPageOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`workspace remains readable in ${theme} at ${width}px`, async ({ page }, testInfo) => {
      await page.addInitScript((nextTheme) => {
        window.localStorage.setItem('notes.theme', nextTheme);
      }, theme);
      await page.setViewportSize({ width, height: 900 });
      await seedNotebook(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await noPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`workspace-${theme}-${width}.png`),
        fullPage: false,
      });
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 768, 1440]) {
    test(`account settings remain contained in ${theme} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript((nextTheme) => {
        window.localStorage.setItem('notes.theme', nextTheme);
      }, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./');
      await page.getByRole('button', { name: 'Create a text note' }).waitFor();
      if (width < 768) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
      } else if (width <= 1100) {
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Open settings', exact: true }).click();
      }
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
      await settings.getByRole('button', { name: /Account & sync/ }).click();
      const lastAction = settings.getByRole('button', { name: 'Resend verification', exact: true });
      await lastAction.scrollIntoViewIfNeeded();
      await expect(lastAction).toBeInViewport({ ratio: 1 });
      await expect(settings.getByRole('button', { name: 'Close settings' })).toBeInViewport({
        ratio: 1,
      });
      await noPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`account-${theme}-${width}.png`),
        fullPage: false,
      });
    });
  }
}

test('writing focus and Markdown export use the current draft without a forced save', async ({
  page,
}, testInfo) => {
  await seedNotebook(page);
  await page.getByRole('button', { name: 'Open note: A place for unfinished thoughts' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit note', exact: true });
  await editor.getByRole('textbox', { name: 'Edit note title' }).fill('Notebook export');
  await editor
    .getByRole('textbox', { name: 'Edit note text' })
    .fill('**Current draft**\nBonjour 안녕하세요');
  await editor.getByRole('button', { name: 'Enter focus mode' }).click();
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
  const drawer = page.getByRole('dialog', { name: 'Primary navigation' });
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
  await editor.getByRole('button', { name: 'Add drawing' }).click();
  const drawing = page.getByRole('dialog', { name: 'Drawing editor' });
  await expect(drawing).toBeVisible();
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    expect(await drawing.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawing).toHaveCount(0);
  await expect(editor).toBeVisible();
});
