import { expect, test } from '@playwright/test';

test('boots the production-path application shell', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByText('Your notes will appear here')).toBeVisible();
  await expect(page.getByLabel('Primary navigation')).toBeVisible();
});
