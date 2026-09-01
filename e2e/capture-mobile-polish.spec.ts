import { expect, test, type Page } from '@playwright/test';

async function seedNotes(page: Page, count: number) {
  await page.goto('./');
  await page.evaluate(async (noteCount) => {
    const dbModule = await import('/notes/src/db/index.ts');
    const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
    for (let index = 0; index < noteCount; index += 1) {
      await repository.create({
        title: `Mobile note ${index + 1}`,
        content: `Capture polish content ${index + 1}`,
      });
    }
  }, count);
}

test.describe('V3.1 capture and mobile UX polish', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('capture stays reachable while scrolling and title Enter advances to note content', async ({
    page,
  }) => {
    await seedNotes(page, 18);
    await page.reload();

    const trigger = page.getByRole('button', { name: 'Create a text note' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(trigger).toBeVisible();

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox?.y ?? 999).toBeLessThan(160);

    const firstCardBox = await page.locator('[data-note-card]').first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    expect(firstCardBox?.width ?? 0).toBeGreaterThan(330);

    await trigger.click();
    const composer = page.getByRole('form', { name: 'New note' });
    const title = composer.getByLabel('Title');
    const body = composer.getByLabel('Note text');

    await title.fill('Fast mobile capture');
    await title.press('Enter');
    await expect(body).toBeFocused();
    await body.fill('The keyboard flow should stay inside capture.');
    await composer.getByRole('button', { name: 'Close' }).click();

    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Open note: Fast mobile capture' }),
    ).toBeVisible();
  });

  test('mobile editor keeps its footer and bottom-sheet actions reachable after long content scrolls', async ({
    page,
  }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      const dbModule = await import('/notes/src/db/index.ts');
      const repository = new dbModule.NotesRepository(dbModule.notesDatabase);
      await repository.create({
        title: 'Long mobile editor',
        content: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join('\n'),
      });
    });
    await page.reload();

    await page.getByRole('button', { name: 'Open note: Long mobile editor' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await editor.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const more = editor.getByRole('button', { name: 'More', exact: true });
    const close = editor.getByRole('button', { name: 'Close', exact: true });
    await expect(more).toBeVisible();
    await expect(close).toBeVisible();

    await more.click();
    const connections = editor.getByRole('menuitem', { name: 'Connections' });
    await expect(connections).toBeVisible();
    const menuItemHeight = await connections.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(menuItemHeight).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Escape');
    await close.click();
  });

  test('checklist title Enter advances directly to the first list item', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Create a checklist' }).click();

    const composer = page.getByRole('form', { name: 'New checklist' });
    const title = composer.getByLabel('Checklist title');
    const firstItem = composer.getByLabel('Checklist item 1');

    await title.fill('Mobile checklist');
    await title.press('Enter');
    await expect(firstItem).toBeFocused();
    await firstItem.fill('First task');
    await expect(firstItem).toHaveValue('First task');
  });
});
