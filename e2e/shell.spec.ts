import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

test('shell remains horizontally stable across target breakpoints', async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('./');

    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  }
});

test('mobile navigation opens as an off-canvas drawer and closes from the backdrop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toHaveAttribute('data-open', 'false');

  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-open', 'true');
  await expect(sidebar).toBeVisible();

  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(sidebar).toHaveAttribute('data-open', 'false');
});

test('desktop navigation can collapse without hiding the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');

  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toHaveAttribute('data-compact', 'false');

  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-compact', 'true');
  await expect(page.getByText('Your notes will appear here')).toBeVisible();
});

test('appearance preference persists across reloads', async ({ page }) => {
  await page.goto('./');

  const themeToggle = page.getByTestId('theme-toggle');
  await themeToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('notes.theme')))
    .toBe('light');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
