import { expect, test, type Page } from '@playwright/test';

const CREDENTIAL_KEY = 'notes.privacy.credential.v1';
const ATTEMPT_KEY = 'notes.privacy.attempts.v1';

async function openPrivacyLockSettings(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Privacy' }).click();
  await settings.getByRole('button', { name: /privacy lock|passcode/u }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy settings' });
  await expect(privacy).toBeVisible();
  return privacy;
}

async function enablePrivacyLock(page: Page, passcode: string) {
  const privacy = await openPrivacyLockSettings(page);
  await privacy.getByLabel('Passcode', { exact: true }).fill(passcode);
  await privacy.getByLabel('Confirm passcode').fill(passcode);
  await privacy.getByRole('button', { name: 'Enable privacy lock' }).click();
  await expect(privacy.getByText(/Privacy lock enabled/u)).toBeVisible();
  return privacy;
}

async function unlock(page: Page, passcode: string) {
  await page.getByLabel('Passcode').fill(passcode);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toHaveCount(0);
}

test('new credentials use the hardened work factor and explicit Lock now reaches sibling tabs', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
  const privacy = await enablePrivacyLock(page, 'p8-lock-4815');

  const credential = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), CREDENTIAL_KEY);
  expect(credential.iterations).toBe(600_000);
  expect(credential.hash).toMatch(/^[0-9a-f]{64}$/u);

  const sibling = await context.newPage();
  await sibling.goto('./');
  await expect(sibling.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  await unlock(sibling, 'p8-lock-4815');
  await expect(sibling.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();

  await privacy.getByRole('button', { name: 'Close privacy settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Lock now' }).click();

  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  await expect(sibling.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
});

test('a legacy 120k credential upgrades in place after a successful unlock', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async (key) => {
    const passcode = 'legacy-p8-passcode';
    const saltBytes = new Uint8Array(16).fill(7);
    const salt = Array.from(saltBytes, (value) => value.toString(16).padStart(2, '0')).join('');
    const imported = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 120_000 },
      imported,
      256,
    );
    const hash = Array.from(new Uint8Array(bits), (value) => value.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, JSON.stringify({ version: 1, salt, hash, iterations: 120_000 }));
  }, CREDENTIAL_KEY);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();
  await unlock(page, 'legacy-p8-passcode');

  const upgraded = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), CREDENTIAL_KEY);
  expect(upgraded.iterations).toBe(600_000);
  expect(upgraded.salt).not.toBe('07'.repeat(16));
  expect(upgraded.hash).toMatch(/^[0-9a-f]{64}$/u);
});

test('repeated wrong passcodes trigger a bounded local cooldown before more hashing work', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate(async (key) => {
    const privacy = await import('/notes/src/features/privacy/privacy.ts');
    const credential = await privacy.createPrivacyCredential('correct-p8-passcode');
    localStorage.setItem(key, JSON.stringify(credential));
  }, CREDENTIAL_KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notes is locked' })).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const input = page.getByLabel('Passcode');
    await input.fill(`wrong-${attempt}`);
    await page.getByRole('button', { name: 'Unlock' }).click();
    if (attempt < 2) await expect(page.getByRole('alert')).toHaveText('Incorrect passcode.');
  }

  await expect(page.getByText(/Too many attempts\. Try again in/u)).toBeVisible();
  await expect(page.getByLabel('Passcode')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Temporarily locked' })).toBeDisabled();

  const attempts = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), ATTEMPT_KEY);
  expect(attempts.failures).toBe(3);
  expect(attempts.blockedUntil - attempts.lastFailureAt).toBe(2_000);
  expect(attempts.blockedUntil).toBeGreaterThan(Date.now());
});
