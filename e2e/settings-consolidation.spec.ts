import { expect, test } from '@playwright/test';

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /appearance/u })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Privacy settings' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  return settings;
}

test('global preferences are consolidated under one Settings surface', async ({ page }) => {
  await page.goto('./');
  const settings = await openSettings(page);

  for (const section of [
    'Appearance',
    'Privacy',
    'Notifications',
    'Search & history',
    'Data & advanced',
  ]) {
    await expect(settings.getByRole('button', { name: section })).toBeVisible();
  }

  await settings.getByRole('button', { name: 'Privacy' }).click();
  await expect(settings.getByLabel('Hide note previews')).toBeVisible();
  await expect(settings.getByLabel('Private reminder notifications')).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Set up privacy lock' })).toBeVisible();
});

test('notification permission UI lives in Settings rather than the Reminders workspace', async ({
  page,
}) => {
  await page.goto('./');
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Notifications' }).click();
  await expect(settings.locator('.reminder-notification-banner')).toBeVisible();
  await settings.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await expect(page.locator('.reminder-notification-banner')).toHaveCount(0);
});

test('advanced data tools leave permanent sidebar chrome and remain reachable from settings and commands', async ({
  page,
}) => {
  await page.goto('./');
  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar.getByText('Tools', { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: /Backup/u })).toHaveCount(0);

  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('settings');
  await expect(palette.getByRole('option', { name: /Open Settings/u })).toBeVisible();
});

test('settings becomes a full-height touch-safe surface on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const settings = await openSettings(page);
  const box = await settings.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(380);
  expect(box!.height).toBeGreaterThanOrEqual(830);
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await expect(settings.getByRole('button', { name: 'Open backup & import' })).toBeVisible();
});
