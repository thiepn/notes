import { expect, test, type Page } from '@playwright/test';

const ONBOARDING_KEY = 'notes.onboarding.quickstart.v1';

async function preparePage(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript((key) => window.localStorage.setItem(key, 'done'), ONBOARDING_KEY);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
}

async function createTerminalNote(page: Page) {
  await page.getByRole('button', { name: 'Create a text note' }).click();
  const composer = page.getByRole('form', { name: 'New note' });
  await composer.getByLabel('Title').fill('P34 final release note');
  await composer
    .getByLabel('Note text')
    .fill('p34-terminal-search-evidence survives reload and final navigation');
  await composer.getByRole('button', { name: 'Close' }).click();
  await expect(
    page.getByRole('button', { name: 'Open note: P34 final release note' }),
  ).toBeVisible();
}

test.describe('P34 post-v1 final hardening and certification', () => {
  test('persisted content survives reload and the final Settings to Privacy to Backup handoff', async ({
    page,
  }) => {
    await preparePage(page);
    await createTerminalNote(page);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Search notes' });
    await search.fill('p34-terminal-search-evidence');
    const result = page.getByRole('button', { name: 'Open note: P34 final release note' });
    await expect(result).toBeVisible();
    await result.click();
    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await expect(editor.getByLabel('Note text')).toContainText('p34-terminal-search-evidence');
    await editor.getByRole('button', { name: 'Close' }).click();

    const clearSearch = page.getByRole('button', { name: 'Clear search query' });
    if (await clearSearch.isVisible()) await clearSearch.click();

    const settingsTrigger = page.getByRole('button', { name: 'Open settings' });
    await settingsTrigger.click();
    let settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Privacy' }).click();
    const lockControl = settings.getByRole('button', { name: 'Set up privacy lock' });
    await lockControl.click();

    const privacy = page.getByRole('dialog', { name: 'Privacy settings' });
    await expect(privacy).toBeVisible();
    await privacy.getByRole('button', { name: 'Close privacy settings' }).click();

    settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Set up privacy lock' })).toBeFocused();
    await settings.getByRole('button', { name: 'Data & advanced' }).click();
    await settings.getByRole('button', { name: 'Open backup & import' }).click();

    await expect(settings).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open note: P34 final release note' }),
    ).toBeVisible();
  });

  test('global modal closure restores the normal keyboard shell instead of leaving stale modal state', async ({
    page,
  }) => {
    await preparePage(page);

    const commandTrigger = page.getByRole('button', { name: 'Open command palette' });
    await commandTrigger.focus();
    await commandTrigger.click();
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(commandTrigger).toBeFocused();

    const settingsTrigger = page.getByRole('button', { name: 'Open settings' });
    await settingsTrigger.focus();
    await settingsTrigger.click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    await expect(settingsTrigger).toBeFocused();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);

    await page.keyboard.press('c');
    const composer = page.getByRole('form', { name: 'New note' });
    await expect(composer).toBeVisible();
    await expect(composer.getByLabel('Note text')).toBeFocused();
    await composer.getByRole('button', { name: 'Close' }).click();
  });

  test('small-mobile final journey returns from Settings to a usable non-overflowing shell', async ({
    page,
  }) => {
    await preparePage(page, { width: 320, height: 568 });

    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const navigation = page.getByRole('dialog', { name: 'More navigation' });
    await expect(navigation).toBeVisible();
    await navigation.getByRole('button', { name: 'Settings', exact: true }).click();

    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Data & advanced' }).click();
    await expect(settings.getByRole('button', { name: 'Data & advanced' })).toBeInViewport();
    await settings.getByRole('button', { name: 'Open backup & import' }).click();

    await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await expect(page.locator('#main-content')).toBeFocused();

    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewport);
    expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewport);

    await page.getByRole('button', { name: 'Show notes' }).click();
    await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New note' })).toBeVisible();
  });
});
