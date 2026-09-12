import { expect, test, type Page } from '@playwright/test';

async function waitForNotesWorkspace(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

test.describe('P21 post-v1 daily-use polish', () => {
  test('quick capture menu supports complete keyboard navigation and focus return', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForNotesWorkspace(page);

    const trigger = page.getByRole('button', { name: 'More capture options' });
    await trigger.focus();
    await trigger.press('ArrowDown');

    const menu = page.getByRole('menu', { name: 'More capture options' });
    const items = menu.getByRole('menuitem');
    await expect(menu).toBeVisible();
    await expect(items).toHaveCount(3);
    await expect(items.first()).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.press('ArrowUp');
    const reopened = page.getByRole('menu', { name: 'More capture options' });
    await expect(reopened.getByRole('menuitem').last()).toBeFocused();
  });

  test('expanded Add popover manages focus without pretending mixed controls are a menu', async ({
    page,
  }) => {
    await page.goto('./');
    await waitForNotesWorkspace(page);

    await page.getByRole('button', { name: 'Create a text note' }).click();
    const composer = page.getByRole('form', { name: 'New note' });
    await expect(composer).toBeVisible();

    const add = composer.getByRole('button', { name: 'Add', exact: true });
    await add.focus();
    await add.press('Enter');

    const popover = composer.getByRole('dialog', { name: 'Add to note' });
    await expect(popover).toBeVisible();
    await expect(add).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(popover.getByRole('button', { name: 'Image' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(composer).toBeVisible();
  });

  test('search keeps query clearing simple and announces active filter count', async ({ page }) => {
    await page.goto('./');
    await waitForNotesWorkspace(page);

    const search = page.getByRole('searchbox', { name: 'Search notes' });
    await search.fill('P21 query');
    await expect(page.getByRole('button', { name: 'Clear search query' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Search filters' }).click();
    const filters = page.getByRole('region', { name: 'Search filters' });
    await expect(filters).toBeVisible();
    await filters.getByLabel('Type').selectOption('text');

    await expect(page.getByRole('button', { name: 'Search filters, 1 active' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  });

  test('Account & sync explains the shared THIEPN Account boundary', async ({ page }) => {
    await page.goto('./');
    await waitForNotesWorkspace(page);

    await page.getByRole('button', { name: 'Open settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: /^Account & sync/u }).click();

    await expect(settings.getByText('THIEPN Account', { exact: true })).toBeVisible();
    await expect(
      settings.getByText(/shared THIEPN Account.*Notes library remains separately authorized/su),
    ).toBeVisible();
  });
});
