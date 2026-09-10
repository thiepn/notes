import { expect, test } from '@playwright/test';

const MOBILE = { width: 390, height: 844 };

test.describe('P11 real-world usage audit', () => {
  test('mobile More drawer contains secondary destinations only', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('./');

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    await mobileNavigation.getByRole('button', { name: 'Open navigation' }).click();

    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar).toHaveAttribute('data-open', 'true');
    await expect(sidebar.getByText('More', { exact: true })).toBeVisible();

    for (const primaryName of ['Notes', 'Search', 'Reminders', 'Write a new note']) {
      await expect(sidebar.getByRole('button', { name: primaryName, exact: true })).toHaveCount(0);
    }

    for (const secondaryName of ['Archive', 'Trash', 'Backup & import', 'Settings', 'Commands']) {
      await expect(sidebar.getByRole('button', { name: secondaryName, exact: true })).toBeVisible();
    }
  });

  test('mobile workspace gets capture above the fold while sync remains accessible', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('./');

    await expect(page.locator('.workspace-heading .workspace-kicker')).not.toBeVisible();
    await expect(page.locator('.workspace-heading p:not(.workspace-kicker)')).not.toBeVisible();

    const sync = page.locator('.workspace-meta .sync-indicator');
    await expect(sync).toBeVisible();
    await expect(sync).toHaveAttribute('aria-label', /Account and sync:/u);
    await expect(sync.locator('span')).not.toBeVisible();

    const composer = page.locator('.note-composer-collapsed');
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.top ?? Number.POSITIVE_INFINITY).toBeLessThan(300);
  });

  test('desktop exposes one visible sync affordance instead of duplicate status chrome', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./');

    await expect(page.locator('.sidebar-footer .sync-indicator')).toBeVisible();
    await expect(page.locator('.workspace-meta .sync-indicator')).not.toBeVisible();
  });

  test('mobile Settings exposes every section without horizontal tab scrolling', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('./');

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    await mobileNavigation.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByTestId('app-sidebar').getByRole('button', { name: 'Settings' }).click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    const navigation = settings.getByRole('navigation', { name: 'Settings sections' });

    for (const sectionName of [
      'Appearance',
      'Account & sync',
      'Privacy',
      'Notifications',
      'Search & history',
      'Data & advanced',
    ]) {
      await expect(
        navigation.getByRole('button', { name: new RegExp(`^${sectionName}`) }),
      ).toBeVisible();
    }

    const geometry = await navigation.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  });

  test('mobile capture sheet omits desktop-only keyboard shortcut copy', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('./');

    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('button', { name: 'New note' })
      .click();

    await expect(page.getByRole('dialog', { name: 'New' })).toBeVisible();
    await expect(
      page.getByText('C creates text instantly · Shift+C creates a checklist'),
    ).not.toBeVisible();
  });
});
