import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page) {
  const width = page.viewportSize()?.width ?? 1280;
  if (width <= 767) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'More navigation' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Settings', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
  }

  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

test('settings sections support directional, Home, and End keyboard navigation on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const settings = await openSettings(page);
  const navigation = settings.getByRole('navigation', { name: 'Settings sections' });
  const appearance = navigation.getByRole('button', { name: 'Appearance' });
  const account = navigation.getByRole('button', { name: 'Account & sync' });
  const privacy = navigation.getByRole('button', { name: 'Privacy' });
  const advanced = navigation.getByRole('button', { name: 'Data & advanced' });

  await appearance.focus();
  await appearance.press('ArrowRight');
  await expect(account).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Account & sync' })).toBeVisible();

  await account.press('ArrowDown');
  await expect(privacy).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Privacy', exact: true })).toBeVisible();

  await privacy.press('End');
  await expect(advanced).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Data & advanced' })).toBeVisible();
  await expect(advanced).toBeInViewport();

  await advanced.press('Home');
  await expect(appearance).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Appearance', exact: true })).toBeVisible();
});

test('clearing recent search history moves focus to explicit completion feedback', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const search = await import('/notes/src/features/search/searchHistory.ts');
    const types = await import('/notes/src/features/search/searchTypes.ts');
    search.rememberRecentSearch({
      query: 'p33 disposable history',
      filters: types.DEFAULT_SEARCH_FILTERS,
    });
  });

  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Search & history' }).click();
  const clear = settings.getByRole('button', { name: 'Clear recent' });
  await expect(clear).toBeEnabled();
  await clear.click();

  const status = settings.getByRole('status');
  await expect(status).toHaveText('Recent search history cleared. Saved searches were kept.');
  await expect(status).toBeFocused();
  await expect(clear).toBeDisabled();
});

test('closing privacy-lock management returns to its originating Settings control', async ({
  page,
}) => {
  await page.goto('./');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Privacy' }).click();
  await settings.getByRole('button', { name: 'Set up privacy lock' }).click();

  const privacy = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(privacy).toBeVisible();
  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();

  const returnedSettings = page.getByRole('dialog', { name: 'Settings' });
  await expect(returnedSettings).toBeVisible();
  const origin = returnedSettings.getByRole('button', { name: 'Set up privacy lock' });
  await expect(origin).toBeFocused();
});

test('opening Backup from Settings closes the modal and focuses the destination workspace', async ({
  page,
}) => {
  await page.goto('./');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();

  await expect(settings).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
  await expect(page.locator('#main-content')).toBeFocused();
});
