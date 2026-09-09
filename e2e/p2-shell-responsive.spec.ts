import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  [320, 'mobile'],
  [360, 'mobile'],
  [375, 'mobile'],
  [390, 'mobile'],
  [430, 'mobile'],
  [600, 'mobile'],
  [767, 'mobile'],
  [768, 'tablet'],
  [820, 'tablet'],
  [1024, 'tablet'],
  [1100, 'tablet'],
  [1101, 'desktop'],
  [1280, 'desktop'],
  [1440, 'desktop'],
  [1920, 'desktop'],
] as const;

test('P2 assigns a deliberate shell mode at every supported breakpoint', async ({ page }) => {
  for (const [width, mode] of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    const shell = page.locator('.app-shell');
    await expect(shell).toHaveAttribute('data-viewport', mode);

    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

    if (mode === 'mobile') {
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
      await expect(page.getByTestId('app-sidebar')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByRole('button', { name: 'Open command palette' })).not.toBeVisible();
    } else if (mode === 'tablet') {
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).not.toBeVisible();
      await expect(page.getByTestId('app-sidebar')).toHaveAttribute('data-compact', 'true');
      await expect(page.getByRole('button', { name: 'Open command palette' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'More options' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).not.toBeVisible();
      await expect(page.getByTestId('app-sidebar')).toHaveAttribute('data-compact', 'false');
      await expect(page.getByRole('button', { name: 'Open command palette' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible();
    }
  }
});

test('desktop sidebar preference persists while tablet retains an automatic compact rail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  const shell = page.locator('.app-shell');
  const sidebar = page.getByTestId('app-sidebar');

  await expect(sidebar).toHaveAttribute('data-compact', 'false');
  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-compact', 'true');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('notes.shell.sidebar')))
    .toBe('compact');

  await page.reload();
  await expect(sidebar).toHaveAttribute('data-compact', 'true');

  await page.setViewportSize({ width: 820, height: 900 });
  await expect(shell).toHaveAttribute('data-viewport', 'tablet');
  await expect(sidebar).toHaveAttribute('data-compact', 'true');
  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-compact', 'false');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('notes.shell.sidebar')))
    .toBe('compact');

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(shell).toHaveAttribute('data-viewport', 'desktop');
  await expect(sidebar).toHaveAttribute('data-compact', 'true');
  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-compact', 'false');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('notes.shell.sidebar')))
    .toBe('expanded');
});

test('mobile bottom navigation owns primary navigation and drawer owns secondary actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  for (const name of [
    'Show notes',
    'Find a note',
    'New note',
    'Show reminders',
    'Open navigation',
  ]) {
    const control = mobileNav.getByRole('button', { name });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await mobileNav.getByRole('button', { name: 'Find a note' }).click();
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeFocused();

  await mobileNav.getByRole('button', { name: 'Show reminders' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();

  await mobileNav.getByRole('button', { name: 'Open navigation' }).click();
  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toHaveAttribute('data-open', 'true');
  await expect(sidebar.getByRole('button', { name: 'Settings' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Close settings' }).click();
});

test('tablet compact rail expands on demand and collapses after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('./');
  const sidebar = page.getByTestId('app-sidebar');

  await expect(sidebar).toHaveAttribute('data-compact', 'true');
  await page.getByTestId('navigation-toggle').click();
  await expect(sidebar).toHaveAttribute('data-compact', 'false');
  await sidebar.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('heading', { name: 'Archive', level: 1 })).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-compact', 'true');

  await page.getByTestId('navigation-toggle').click();
  await sidebar.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-compact', 'true');
});

test('header search and global actions never collide from tablet through wide desktop', async ({
  page,
}) => {
  for (const width of [768, 820, 1024, 1100, 1101, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    const geometry = await page.locator('.app-header').evaluate((header) => {
      const search = header.querySelector('.search-shell')!.getBoundingClientRect();
      const actions = header.querySelector('.header-actions')!.getBoundingClientRect();
      return { searchRight: search.right, actionsLeft: actions.left };
    });
    expect(geometry.searchRight + 8).toBeLessThanOrEqual(geometry.actionsLeft);
  }
});
