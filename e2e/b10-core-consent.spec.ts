import { expect, test } from '@playwright/test';

test('B10 does not offer Core coordination to a guest Notes workspace', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();
  await expect(settings.getByText('Cross-device sync')).toBeVisible();
  await expect(settings.getByTestId('core-coordination-controls')).toHaveCount(0);
  await expect(settings.getByTestId('core-coordination-toggle')).toHaveCount(0);
});
