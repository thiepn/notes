import { expect, test } from '@playwright/test';
test('B16 guest recovery history inspection is transient and never grants Core', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();
  const board = settings.getByTestId('b16-notes-recovery-history');
  await expect(board).toBeVisible();
  await settings.getByTestId('b15-notes-inspect-recovery').click();
  await expect(settings.getByTestId('b15-notes-recovery-result')).toContainText('local-only');
  await expect(board.locator('li')).toHaveCount(0);
  await expect(settings.getByTestId('core-coordination-toggle')).toHaveCount(0);
});
