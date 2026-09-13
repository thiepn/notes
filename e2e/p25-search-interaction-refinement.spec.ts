import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible();
}

test.describe('P25 search filters', () => {
  test('desktop filter dialog receives focus, closes locally on Escape, and restores its trigger', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForNotesWorkspace(page);

    const trigger = page.getByRole('button', { name: 'Search filters' });
    await trigger.focus();
    await trigger.press('Enter');

    const filters = page.getByRole('dialog', { name: 'Search filters' });
    const close = filters.getByRole('button', { name: 'Close search filters' });
    await expect(filters).toBeVisible();
    await expect(filters).not.toHaveAttribute('aria-modal', 'true');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(filters).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('mobile filter sheet is modal, traps focus, and restores the search filter trigger', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await waitForNotesWorkspace(page);

    const trigger = page.getByRole('button', { name: 'Search filters' });
    await trigger.click();
    const filters = page.getByRole('dialog', { name: 'Search filters' });
    const close = filters.getByRole('button', { name: 'Close search filters' });
    const clear = filters.getByRole('button', { name: 'Clear filters' });

    await expect(filters).toHaveAttribute('aria-modal', 'true');
    await expect(close).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(clear).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(filters).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test('search assist supports Home and End navigation and Escape returns to search', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.focus();
  await search.fill('has:');
  const assist = page.getByRole('dialog', { name: 'Search history' });
  const items = assist.locator('[data-search-nav="true"]');
  await expect(items).not.toHaveCount(0);

  await search.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(search).toBeFocused();
});

test('removing a saved search returns focus to the search box instead of losing it', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotesWorkspace(page);
  await page.evaluate(async () => {
    const dbModule = await import('/notes/src/db/index.ts');
    const historyModule = await import('/notes/src/features/search/searchHistory.ts');
    const typesModule = await import('/notes/src/features/search/searchTypes.ts');
    const history = new historyModule.SearchHistoryRepository(dbModule.notesDatabase);
    await history.save({
      query: 'mission planning',
      filters: { ...typesModule.DEFAULT_SEARCH_FILTERS },
    });
  });
  await page.reload();
  await waitForNotesWorkspace(page);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.focus();
  await search.fill('mission');
  const assist = page.getByRole('dialog', { name: 'Search history' });
  await assist.getByRole('button', { name: 'Remove saved search: mission planning' }).click();

  await expect(search).toBeFocused();
});
