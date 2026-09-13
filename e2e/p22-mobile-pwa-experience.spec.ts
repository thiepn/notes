import { expect, test, type Page } from '@playwright/test';

async function dispatchInstallPrompt(
  page: Page,
  options: { outcome?: 'accepted' | 'dismissed'; failPrompt?: boolean } = {},
) {
  await page.evaluate(
    ({ outcome, failPrompt }) => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          if (failPrompt) throw new Error('Synthetic install failure');
        },
        userChoice: Promise.resolve({ outcome, platform: 'web' }),
      });
      window.dispatchEvent(event);
    },
    { outcome: options.outcome ?? 'dismissed', failPrompt: options.failPrompt ?? false },
  );
}

test.describe('P22 mobile and PWA experience', () => {
  test('dismissed install guidance stays dismissed across reloads in the same browser session', async ({
    page,
  }) => {
    await page.goto('./');
    await dispatchInstallPrompt(page);

    await expect(page.getByText('Install Notes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss install prompt' }).click();
    await expect(page.getByText('Install Notes', { exact: true })).not.toBeVisible();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('notes.pwa.install-dismissed')))
      .toBe('1');

    await page.reload();
    await dispatchInstallPrompt(page);
    await expect(page.getByText('Install Notes', { exact: true })).toHaveCount(0);
  });

  test('a failed browser install handoff explains the fallback without suppressing a later retry', async ({
    page,
  }) => {
    await page.goto('./');
    await dispatchInstallPrompt(page, { failPrompt: true });

    await page.getByRole('button', { name: 'Install', exact: true }).click();
    await expect(page.getByText('Install unavailable', { exact: true })).toBeVisible();
    await expect(
      page.getByText("Use your browser's install or Add to Home screen action if available."),
    ).toBeVisible();
    expect(
      await page.evaluate(() => sessionStorage.getItem('notes.pwa.install-dismissed')),
    ).toBeNull();

    await page.getByRole('button', { name: 'Dismiss install warning' }).click();
    await dispatchInstallPrompt(page, { outcome: 'accepted' });
    await expect(page.getByText('Install Notes', { exact: true })).toBeVisible();
  });

  test('mobile PWA status stays above fixed navigation and preserves usable workspace clearance', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    const status = page.locator('.pwa-status');
    const navigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(status).toBeVisible();
    await expect(navigation).toBeVisible();

    const geometry = await page.evaluate(() => {
      const statusRect = document.querySelector('.pwa-status')!.getBoundingClientRect();
      const navigationRect = document.querySelector('.mobile-navigation')!.getBoundingClientRect();
      const workspace = document.querySelector<HTMLElement>('.workspace')!;
      return {
        statusBottom: statusRect.bottom,
        navigationTop: navigationRect.top,
        navigationHeight: navigationRect.height,
        workspacePaddingBottom: Number.parseFloat(getComputedStyle(workspace).paddingBottom),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });

    expect(geometry.navigationTop - geometry.statusBottom).toBeGreaterThanOrEqual(8);
    expect(geometry.workspacePaddingBottom).toBeGreaterThanOrEqual(geometry.navigationHeight + 20);
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(status).not.toBeVisible();
  });
});
