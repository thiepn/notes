import { expect, test, type Page, type Route } from '@playwright/test';

const SUPABASE_HOST = 'https://hycegznamzjhwinegaai.supabase.co';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'notes-owner@example.com';
const FUTURE_EXPIRY = 4_102_444_800;

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

async function openSyncSettings(page: Page) {
  await page.getByTestId('header-more-toggle').click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: /Account & sync/u }).click();
  await expect(page.getByRole('heading', { name: 'Account & sync' })).toBeVisible();
}

async function fillSignedOutCredentials(page: Page) {
  const section = page.locator('section[aria-label="Sign in and account recovery"]');
  await section.locator('input[type="email"]').fill(EMAIL);
  await section.locator('input[type="password"]').fill('correct horse battery staple');
  return section;
}

test.describe('Supabase account and sync', () => {
  test('password recovery and verification resend return to the Notes route', async ({ page }) => {
    let recoveryRedirect = '';
    let resendRedirect = '';
    let resendBody: Record<string, unknown> | null = null;

    await page.route(`${SUPABASE_HOST}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/auth/v1/recover') {
        recoveryRedirect = url.searchParams.get('redirect_to') ?? '';
        return json(route, {});
      }
      if (url.pathname === '/auth/v1/resend') {
        resendRedirect = url.searchParams.get('redirect_to') ?? '';
        resendBody = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        return json(route, {});
      }
      return route.abort();
    });

    await page.goto('./');
    await openSyncSettings(page);
    const section = await fillSignedOutCredentials(page);

    await section.getByRole('button', { name: 'Forgot password' }).click();
    await expect(page.getByRole('status')).toContainText('password-reset link');
    expect(recoveryRedirect).toBe('https://thiepn.dev/notes/?auth=recovery');

    await section.getByRole('button', { name: 'Resend verification' }).click();
    await expect(page.getByRole('status')).toContainText('verification email');
    expect(resendRedirect).toBe('https://thiepn.dev/notes/?auth=confirm');
    expect(resendBody).toMatchObject({ type: 'signup', email: EMAIL });
  });

  test('sign-in, private workspace claim, session listing, and destructive gates work together', async ({
    page,
  }) => {
    let hasAccess = false;
    let claimedCode = '';

    await page.route(`${SUPABASE_HOST}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        return json(route, {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: FUTURE_EXPIRY,
          token_type: 'bearer',
          user: { id: USER_ID, email: EMAIL },
        });
      }
      if (url.pathname === '/rest/v1/rpc/has_notes_sync_access') {
        return json(route, hasAccess);
      }
      if (url.pathname === '/rest/v1/rpc/claim_notes_sync_access') {
        const body = JSON.parse(request.postData() ?? '{}') as { p_code?: string };
        claimedCode = body.p_code ?? '';
        hasAccess = true;
        return json(route, true);
      }
      if (url.pathname === '/rest/v1/notes_sync_records') {
        return json(route, []);
      }
      if (url.pathname === '/rest/v1/rpc/list_notes_auth_sessions') {
        return json(route, [
          {
            id: '22222222-2222-4222-8222-222222222222',
            created_at: '2026-09-08T20:00:00Z',
            updated_at: '2026-09-08T21:00:00Z',
            refreshed_at: '2026-09-08T21:00:00Z',
            not_after: null,
            user_agent: 'Certification Browser',
            is_current: true,
          },
        ]);
      }
      return route.abort();
    });

    await page.goto('./');
    await openSyncSettings(page);
    const authSection = await fillSignedOutCredentials(page);
    await authSection.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Setup required')).toBeVisible();
    const claimInput = page.locator('section[aria-label="Cloud sync"] input[type="password"]');
    await expect(claimInput).toBeVisible();
    await claimInput.fill('one-time-private-code');
    await page.getByRole('button', { name: 'Claim private workspace' }).click();

    expect(claimedCode).toBe('one-time-private-code');
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
    await expect(page.getByText('Certification Browser')).toBeVisible();

    const cloudDeleteInput = page
      .locator('section[aria-label="Cloud data deletion"]')
      .locator('input')
      .nth(0);
    const accountDeleteInput = page
      .locator('section[aria-label="Cloud data deletion"]')
      .locator('input')
      .nth(1);
    const cloudDeleteButton = page.getByRole('button', { name: 'Delete cloud copy' });
    const accountDeleteButton = page.getByRole('button', { name: 'Delete account identity' });

    await expect(cloudDeleteButton).toBeDisabled();
    await cloudDeleteInput.fill('DELETE CLOUD');
    await expect(cloudDeleteButton).toBeEnabled();
    await expect(accountDeleteButton).toBeDisabled();
    await accountDeleteInput.fill('DELETE ACCOUNT');
    await expect(accountDeleteButton).toBeEnabled();
  });

  test('recovery callbacks remove tokens from the URL and allow a password replacement', async ({
    page,
  }) => {
    let updateBody: Record<string, unknown> | null = null;

    await page.route(`${SUPABASE_HOST}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
        return json(route, { id: USER_ID, email: EMAIL });
      }
      if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
        updateBody = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
        return json(route, { id: USER_ID, email: EMAIL });
      }
      if (url.pathname === '/rest/v1/rpc/has_notes_sync_access') {
        return json(route, false);
      }
      return route.abort();
    });

    await page.goto(
      './?auth=recovery#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery',
    );
    await expect.poll(() => page.url()).not.toContain('access_token=');
    await expect.poll(() => page.url()).not.toContain('#');

    await openSyncSettings(page);
    await expect(page.getByText('Password recovery', { exact: true })).toBeVisible();
    const recovery = page.locator('section[aria-label="Password recovery"]');
    const passwordFields = recovery.locator('input[type="password"]');
    await passwordFields.nth(0).fill('new secure password 123');
    await passwordFields.nth(1).fill('new secure password 123');
    await recovery.getByRole('button', { name: 'Save new password' }).click();

    await expect(page.getByRole('status')).toContainText('Password updated');
    expect(updateBody).toMatchObject({ password: 'new secure password 123' });
  });
});
