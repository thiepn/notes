import { expect, test } from '@playwright/test';

test('boots the production-path application shell', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(page.getByText('Local-first foundation ready.')).toBeVisible();
});
