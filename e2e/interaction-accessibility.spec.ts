import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function seedNote(page: Page, title = 'Accessible interaction note') {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({
      title: noteTitle,
      content: 'Keyboard and accessibility regression content.',
    });
  }, title);
  await page.reload();
  await waitForNotesWorkspace(page);
}

test('header More menu follows keyboard menu navigation and restores trigger focus', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);

  const trigger = page.getByRole('button', { name: 'More options' });
  await trigger.focus();
  await trigger.press('ArrowDown');

  const menu = page.getByRole('menu', { name: 'More options' });
  await expect(menu).toBeVisible();
  const items = menu.getByRole('menuitem');
  await expect(items.first()).toBeFocused();

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
  const reopened = page.getByRole('menu', { name: 'More options' });
  await expect(reopened.getByRole('menuitem').last()).toBeFocused();
});

test('command palette exposes its active option to assistive technology while keeping focus in the combobox', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.keyboard.press('Control+K');

  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const input = palette.getByRole('combobox', { name: 'Search commands' });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-autocomplete', 'list');

  const firstActiveId = await input.getAttribute('aria-activedescendant');
  expect(firstActiveId).toBeTruthy();
  const firstActive = page.locator(`#${firstActiveId}`);
  await expect(firstActive).toHaveAttribute('aria-selected', 'true');

  await input.press('ArrowDown');
  const secondActiveId = await input.getAttribute('aria-activedescendant');
  expect(secondActiveId).toBeTruthy();
  expect(secondActiveId).not.toBe(firstActiveId);
  await expect(page.locator(`#${secondActiveId}`)).toHaveAttribute('aria-selected', 'true');

  await input.press('Tab');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('dialog focus containment keeps keyboard focus inside Settings', async ({ page }) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();

  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const close = dialog.getByRole('button', { name: 'Close settings' });
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);

  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);
});

test('reduced-motion and forced-colors requests preserve interaction visibility without card motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await seedNote(page, 'Reduced motion note');

  const card = page.locator('[data-note-card]').first();
  await card.hover();
  expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');

  const search = page.getByRole('search');
  await search.getByRole('searchbox', { name: 'Search notes' }).focus();
  const focusStyle = await search.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { style: styles.outlineStyle, width: styles.outlineWidth };
  });
  expect(focusStyle.style).toBe('solid');
  expect(focusStyle.width).toBe('2px');
});
