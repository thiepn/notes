import { expect, test } from '@playwright/test';

async function seedNote(page: import('@playwright/test').Page, title = 'Visual polish note') {
  await page.goto('./');
  await page.evaluate(async (noteTitle) => {
    const db = await import('/notes/src/db/index.ts');
    const repository = new db.NotesRepository(db.notesDatabase);
    await repository.create({
      title: noteTitle,
      content: 'Calm readable note content for visual checks.',
    });
  }, title);
}

async function themeTokens(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    return {
      theme: root.dataset.theme,
      background: styles.getPropertyValue('--bg').trim(),
      surface: styles.getPropertyValue('--surface').trim(),
      surfaceSubtle: styles.getPropertyValue('--surface-subtle').trim(),
      text: styles.getPropertyValue('--text').trim(),
      yellow: styles.getPropertyValue('--note-yellow').trim(),
    };
  });
}

test('V5 uses intentionally designed light and dark tonal palettes', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('notes.theme', 'light'));
  await page.reload();

  await expect
    .poll(() => themeTokens(page))
    .toEqual({
      theme: 'light',
      background: '#f6f3ed',
      surface: '#fffdf8',
      surfaceSubtle: '#eeebe4',
      text: '#282724',
      yellow: '#f6f0d5',
    });

  await page.evaluate(() => localStorage.setItem('notes.theme', 'dark'));
  await page.reload();

  await expect
    .poll(() => themeTokens(page))
    .toEqual({
      theme: 'dark',
      background: '#191b1d',
      surface: '#222527',
      surfaceSubtle: '#2b2e30',
      text: '#eee9df',
      yellow: '#333125',
    });
});

test('cards, navigation, search, and settings use the Paper & Ink V5 hierarchy', async ({
  page,
}) => {
  await seedNote(page);
  await page.reload();

  const card = page.locator('[data-note-card]').first();
  await expect(card).toBeVisible();
  const cardStyle = await card.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      radius: styles.borderRadius,
      border: styles.borderColor,
      shadow: styles.boxShadow,
    };
  });
  expect(cardStyle.radius).toBe('3px');
  expect(cardStyle.shadow).toBe('none');

  const countStyle = await page
    .locator('.nav-count')
    .first()
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return { border: styles.borderTopWidth, background: styles.backgroundColor };
    });
  expect(countStyle.border).toBe('0px');
  expect(countStyle.background).toBe('rgba(0, 0, 0, 0)');

  const search = page.getByRole('search');
  await search.getByRole('searchbox', { name: 'Search notes' }).focus();
  const searchShadow = await search.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(searchShadow).not.toBe('none');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.settings-dialog-icon')).toBeHidden();

  await dialog.getByRole('button', { name: /Privacy/ }).click();
  const privacyGroup = dialog.locator('.settings-group').first();
  expect(await privacyGroup.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
    '0px',
  );
  const privacySwitch = dialog.locator(".settings-switch-row input[type='checkbox']").first();
  await expect(privacySwitch).toBeVisible();
  expect(await privacySwitch.evaluate((element) => getComputedStyle(element).width)).toBe('20px');
  expect(await privacySwitch.evaluate((element) => getComputedStyle(element).height)).toBe('20px');
});

test('mobile cards expose one quiet overflow path instead of a persistent action toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedNote(page, 'Mobile visual polish');
  await page.reload();

  const card = page.locator('[data-note-card]').first();
  await expect(card).toBeVisible();
  const directSecondaryDisplays = await card
    .locator('.note-card-direct-secondary')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).display));
  expect(directSecondaryDisplays.length).toBeGreaterThan(0);
  expect(directSecondaryDisplays.every((display) => display === 'none')).toBe(true);
  await expect(card.getByRole('button', { name: /More actions:/ })).toBeVisible();

  const cardRadius = await card.evaluate((element) => getComputedStyle(element).borderRadius);
  expect(cardRadius).toBe('3px');
});
