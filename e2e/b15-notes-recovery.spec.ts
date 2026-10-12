import { expect, test } from '@playwright/test';
test('B15 Notes guest native recovery inspector is actionable but never grants Core', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Account & sync' }).click();
  const recovery = settings.getByTestId('b15-notes-recovery-center');
  await expect(recovery).toBeVisible();
  await recovery.getByTestId('b15-notes-inspect-recovery').click();
  await expect(recovery.getByTestId('b15-notes-recovery-result')).toContainText('local-only');
  await expect(recovery.getByTestId('b15-notes-recovery-result')).toContainText('NOT TESTED');
  await expect(settings.getByTestId('core-coordination-toggle')).toHaveCount(0);
  await expect(recovery.getByTestId('b16-notes-incident-list')).toContainText('inspect');
  await expect(recovery.getByTestId('b16-notes-evidence')).toContainText('NOT TESTED');
  await recovery.getByTestId('b15-notes-open-backup').click();
  await expect(page.getByText(/Backup & import|Full backup|Manual backup/i).first()).toBeVisible();
});
