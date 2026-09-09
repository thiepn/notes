import { expect, test } from '@playwright/test';

for (const width of [320, 390, 767, 768, 820, 1024, 1280, 1440, 1920]) {
  test(`header controls remain separated and pointer-reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Create a text note' })).toBeVisible();
    const header = page.locator('.app-header');

    await expect
      .poll(() =>
        header.evaluate((element) => {
          const search = element.querySelector('.search-shell')!.getBoundingClientRect();
          const actions = element.querySelector('.header-actions')!.getBoundingClientRect();
          const issues: string[] = [];
          const sameRow = search.top < actions.bottom && actions.top < search.bottom;
          if (sameRow && search.right + 8 > actions.left) issues.push('search/actions overlap');
          for (const control of element.querySelectorAll<HTMLElement>('button, input')) {
            const rect = control.getBoundingClientRect();
            if (!rect.width || !rect.height || getComputedStyle(control).visibility === 'hidden')
              continue;
            const name = control.getAttribute('aria-label') || control.tagName;
            if (rect.left < 0 || rect.right > innerWidth) issues.push(`${name}: outside viewport`);
            const target = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            if (!target || !control.contains(target)) issues.push(`${name}: obstructed`);
          }
          return issues;
        }),
      )
      .toEqual([]);

    await header.getByRole('button', { name: 'Search filters', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Search filters' })).toBeVisible();
    await header.getByRole('button', { name: 'Open settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole('button', { name: 'Close settings' }).click();
    await header.getByRole('button', { name: 'Open command palette', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  });
}
