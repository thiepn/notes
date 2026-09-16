import { expect, test, type Page, type Route } from '@playwright/test';

const SUPABASE_HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const EMAIL = 'p31-owner@example.com';

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

async function openSyncSettings(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  if (!(await dialog.isVisible())) {
    await page.getByTestId('header-more-toggle').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(dialog).toBeVisible();
  }

  const heading = page.getByRole('heading', { name: 'Account & sync' });
  if (!(await heading.isVisible())) {
    await page.getByRole('button', { name: /Account & sync/u }).click();
  }
  await expect(heading).toBeVisible();
}

async function fillSignedOutFields(page: Page) {
  const section = page.locator('section[aria-label="Sign in and account recovery"]');
  const email = section.locator('input[type="email"]');
  const password = section.locator('input[type="password"]');
  await email.fill(EMAIL);
  await password.fill('p31-test-password');
  return { section, email, password };
}

test('account request exposes specific busy state and locks editable credentials', async ({ page }) => {
  let releaseRequest: (() => void) | null = null;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route(`${SUPABASE_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/recover') {
      await requestGate;
      return json(route, {});
    }
    return route.abort();
  });

  await page.goto('./');
  await openSyncSettings(page);
  const { section, email, password } = await fillSignedOutFields(page);
  await section.getByRole('button', { name: 'Forgot password' }).click();

  await expect(page.getByText('Sending password-reset link…', { exact: true })).toBeVisible();
  await expect(section).toHaveAttribute('aria-busy', 'true');
  await expect(email).toBeDisabled();
  await expect(password).toBeDisabled();
  await expect(section.getByRole('button', { name: 'Sign in' })).toBeDisabled();

  releaseRequest?.();

  await expect(section).not.toHaveAttribute('aria-busy', 'true');
  await expect(email).toBeEnabled();
  await expect(password).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('password-reset link');
});

test('failed account request focuses the retryable alert and unlocks the form', async ({ page }) => {
  let releaseRequest: (() => void) | null = null;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route(`${SUPABASE_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/resend') {
      await requestGate;
      return json(route, { message: 'Synthetic P31 verification failure' }, 503);
    }
    return route.abort();
  });

  await page.goto('./');
  await openSyncSettings(page);
  const { section, email, password } = await fillSignedOutFields(page);
  await section.getByRole('button', { name: 'Resend verification' }).click();

  await expect(page.getByText('Requesting verification email…', { exact: true })).toBeVisible();
  await expect(email).toBeDisabled();
  await expect(password).toBeDisabled();

  releaseRequest?.();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(section).not.toHaveAttribute('aria-busy', 'true');
  await expect(email).toBeEnabled();
  await expect(password).toBeEnabled();
});
