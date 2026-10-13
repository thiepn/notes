import { expect, test } from '@playwright/test';

test('B25 guest validates an actual saved original Notes backup, compares it and verifies restore readback', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Backup & import' }).click();
  const handoff = page.getByTestId('b22-backup-device-handoff');
  await expect(handoff).toBeVisible();
  await expect(page.getByTestId('b25-notes-compare-backup')).toBeDisabled();

  const backupDownloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const backup = await backupDownloaded;
  const localFile = await backup.path();
  if (!localFile) throw new Error('The original Notes download was not available for local handoff verification.');

  await page.getByLabel('Choose backup file').setInputFiles(localFile);
  await expect(page.getByLabel('Validated backup preview')).toBeVisible();
  await page.getByTestId('b25-notes-compare-backup').click();
  await expect(page.getByTestId('b25-notes-compare-result')).toContainText(
    'Matched all original data categories',
  );

  await page.getByLabel('I understand that this backup will replace the current local library.').check();
  await page.getByRole('button', { name: 'Review restore' }).click();
  const safetyDownload = page.waitForEvent('download');
  await page.getByRole('alertdialog', { name: 'Restore and replace local library?' })
    .getByRole('button', { name: 'Restore library' }).click();
  await safetyDownload;
  await expect(page.getByTestId('b25-notes-restore-readback')).toContainText(
    'MATCHED all eight original Notes categories',
  );
  await expect(page.getByTestId('b25-notes-restore-readback')).toContainText(
    'External custody NOT TESTED',
  );
});
