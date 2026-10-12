import { expect, test } from '@playwright/test';

test('B12 native Notes ecosystem overview is truthful and private for a guest', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();

  const board = settings.getByTestId('b12-ecosystem-dashboard');
  await expect(board).toBeVisible();
  await expect(board.getByText(/Notes ·/u)).toBeVisible();
  await expect(board.getByRole('link', { name: 'Open Library sync' }))
    .toHaveAttribute('href', '/library/account');
  await expect(board.getByRole('link', { name: 'Open Hub' }))
    .toHaveAttribute('href', '/');
  await expect(board.getByText(/No cross-app private records/u)).toHaveCount(0);
  await expect(settings.getByTestId('core-coordination-toggle')).toHaveCount(0);
});
