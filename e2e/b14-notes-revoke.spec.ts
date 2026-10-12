import { expect, test } from '@playwright/test';

test('B14 private Notes device controls remain inaccessible without a native owner grant', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();
  await expect(settings.getByTestId('b12-ecosystem-dashboard')).toBeVisible();
  await expect(settings.getByTestId('core-coordination-toggle')).toHaveCount(0);
  await expect(settings.getByTestId('b14-notes-revoke-core')).toHaveCount(0);
  await expect(settings.getByTestId('b13-open-native-notes-backup')).toBeVisible();
  await settings.getByTestId('b13-open-native-notes-backup').click();
  await expect(page.getByText(/Backup & import|Full backup|Manual backup/i).first()).toBeVisible();
});
