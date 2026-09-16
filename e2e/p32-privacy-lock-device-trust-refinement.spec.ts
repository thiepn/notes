import { expect, test, type Page } from '@playwright/test';

const CREDENTIAL_KEY = 'notes.privacy.credential.v1';
const PREFERENCES_KEY = 'notes.privacy.preferences.v1';

async function openPrivacySettings(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Privacy' }).click();
  await settings.getByRole('button', { name: /privacy lock|passcode/u }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(privacy).toBeVisible();
  return { settings, privacy };
}

async function seedPrivacyCredential(page: Page, passcode: string, autoLockMinutes = 5) {
  await page.goto('./');
  await page.evaluate(
    async ({ credentialKey, preferencesKey, passcodeValue, autoLock }) => {
      const privacy = await import('/notes/src/features/privacy/privacy.ts');
      const credential = await privacy.createPrivacyCredential(passcodeValue);
      localStorage.setItem(credentialKey, JSON.stringify(credential));
      localStorage.setItem(
        preferencesKey,
        JSON.stringify({
          hidePreviews: false,
          privateNotifications: true,
          autoLockMinutes: autoLock,
        }),
      );
    },
    {
      credentialKey: CREDENTIAL_KEY,
      preferencesKey: PREFERENCES_KEY,
      passcodeValue: passcode,
      autoLock: autoLockMinutes,
    },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
}

async function unlock(page: Page, passcode: string) {
  await page.getByLabel('Passcode').fill(passcode);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toHaveCount(0);
}

test('privacy settings focus validation and success feedback without changing the security boundary', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  const { privacy } = await openPrivacySettings(page);

  await privacy.getByLabel('Passcode', { exact: true }).fill('4815');
  await privacy.getByLabel('Confirm passcode').fill('0000');
  await privacy.getByRole('button', { name: 'Enable privacy lock' }).click();

  const alert = privacy.getByRole('alert');
  await expect(alert).toHaveText('Passcodes do not match.');
  await expect(alert).toBeFocused();

  await privacy.getByLabel('Confirm passcode').fill('4815');
  await privacy.getByRole('button', { name: 'Enable privacy lock' }).click();

  const status = privacy.getByRole('status');
  await expect(status).toContainText('Privacy lock enabled.');
  await expect(status).toBeFocused();
  await expect(privacy).toContainText(
    'Auto-lock applies only to the Notes tab that was hidden; Lock now also locks sibling Notes tabs',
  );
  await expect(privacy.getByLabel('Auto-lock after Notes is hidden')).toBeEnabled();
});

test('unlock failures receive focus and cooldown recovery returns focus to the passcode field', async ({
  page,
}) => {
  await seedPrivacyCredential(page, 'p32-correct-passcode');
  const passcode = page.getByLabel('Passcode');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await passcode.fill(`wrong-${attempt}`);
    await page.getByRole('button', { name: 'Unlock' }).click();
    const alert = page.locator('.privacy-lock-card').getByRole('alert');
    await expect(alert).toHaveText('Incorrect passcode.');
    await expect(alert).toBeFocused();
  }

  await passcode.fill('wrong-2');
  await page.getByRole('button', { name: 'Unlock' }).click();

  const cooldown = page.locator('.privacy-lock-card').getByRole('status');
  await expect(cooldown).toContainText('Too many attempts. Try again in');
  await expect(cooldown).toBeFocused();
  await expect(passcode).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Temporarily locked' })).toBeDisabled();

  await expect(passcode).toBeEnabled({ timeout: 4_000 });
  await expect(passcode).toBeFocused();
  await expect(page.locator('.privacy-lock-card').getByRole('alert')).toHaveCount(0);
});

test('a stricter auto-lock preference uses time already spent hidden instead of restarting the clock', async ({
  page,
}) => {
  await seedPrivacyCredential(page, 'p32-auto-lock-passcode', 5);
  await unlock(page, 'p32-auto-lock-passcode');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  await page.evaluate(() => {
    const state = window as typeof window & { __p32Now?: number };
    state.__p32Now = Date.now();
    Date.now = () => state.__p32Now ?? 0;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.evaluate((preferencesKey) => {
    const state = window as typeof window & { __p32Now?: number };
    state.__p32Now = (state.__p32Now ?? Date.now()) + 2 * 60_000;
    const next = JSON.stringify({
      hidePreviews: false,
      privateNotifications: true,
      autoLockMinutes: 1,
    });
    localStorage.setItem(preferencesKey, next);
    window.dispatchEvent(new StorageEvent('storage', { key: preferencesKey, newValue: next }));
  }, PREFERENCES_KEY);

  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible({
    timeout: 2_000,
  });
});
