import { expect, test } from '@playwright/test';

test('B17 guest cannot export Account-bound device summary or claim external custody', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();
  const recovery = settings.getByTestId('b17-notes-device-handoff');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText('Claim and authorize');
  const steps = recovery.getByTestId('b19-notes-recovery-steps');
  await expect(steps).toBeVisible();
  await expect(steps.locator('li')).toHaveCount(3);
  await expect(steps).toContainText('original Notes Account');
  await expect(steps).toContainText('Backup & import');
  await recovery.getByTestId('b20-notes-check-switch').click();
  await expect(recovery.getByTestId('b20-notes-switch-result')).toContainText('LOCAL-ONLY');
  await expect(recovery.getByTestId('b20-notes-switch-result')).toContainText('NOT TESTED');

  await expect(recovery.getByTestId('b17-notes-export-summary')).toHaveCount(0);
  await expect(recovery.getByTestId('b17-notes-compare-summary')).toHaveCount(0);
  await expect(recovery.getByTestId('b17-notes-device-result')).toContainText('NOT TESTED');
  await recovery.getByTestId('b22-notes-review-live-handoff').click();
  await expect(recovery.getByTestId('b22-notes-handoff-result')).toContainText('ACCOUNT-REQUIRED');
  await expect(recovery.getByTestId('b22-notes-handoff-result')).toContainText('NOT TESTED');
  await expect(recovery.getByTestId('b21-notes-recheck-native')).toHaveCount(0);
  await recovery.getByTestId('b21-notes-open-original-backup').click();
  await expect(page.getByText(/Backup & import|Full backup|Manual backup/i).first()).toBeVisible();
});
