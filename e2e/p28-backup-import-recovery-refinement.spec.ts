import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function openBackupTools(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Data & advanced' }).click();
  await settings.getByRole('button', { name: 'Open backup & import' }).click();
  await expect(page.getByRole('heading', { name: 'Backup', level: 1 })).toBeVisible();
}

async function makeBackup(page: Page) {
  return page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const backup = await import('/notes/src/features/backup/backupRepository.ts');
    await new db.NotesRepository(db.notesDatabase).create({
      title: 'P28 backup source',
      content: 'This note belongs to the validated P28 recovery snapshot.',
    });
    return (await new backup.BackupRepository(db.notesDatabase).exportBackup()).json;
  });
}

async function addDivergentNote(page: Page) {
  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    await new db.NotesRepository(db.notesDatabase).create({
      title: 'P28 current-only note',
      content: 'This note must disappear after replacement restore.',
    });
  });
}

async function selectBackup(page: Page, json: string) {
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'p28-recovery.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  const preview = page.getByLabel('Validated backup preview');
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();
  await preview.getByRole('checkbox').check();
  return preview;
}

test('validated restore preview has deterministic focus and cancellation returns to its trigger', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const backup = await makeBackup(page);
  await addDivergentNote(page);
  await openBackupTools(page);

  const preview = await selectBackup(page, backup);
  const review = preview.getByRole('button', { name: 'Review restore' });
  await review.click();

  const dialog = page.getByRole('alertdialog', { name: 'Restore and replace local library?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
});

test('restore confirmation locks while busy, keeps failure retryable, and succeeds without losing the validated backup', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  const backup = await makeBackup(page);
  await addDivergentNote(page);
  await openBackupTools(page);

  await page.evaluate(async () => {
    const backupModule = await import('/notes/src/features/backup/backupRepository.ts');
    const prototype = backupModule.BackupRepository.prototype;
    const original = prototype.restorePrepared;
    let firstAttempt = true;
    let release: (() => void) | null = null;

    prototype.restorePrepared = async function (...args: Parameters<typeof original>) {
      if (firstAttempt) {
        firstAttempt = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('Synthetic P28 restore failure');
      }
      return original.apply(this, args);
    };

    (
      window as typeof window & {
        __p28ReleaseRestore?: () => void;
      }
    ).__p28ReleaseRestore = () => {
      release?.();
      release = null;
    };
  });

  const preview = await selectBackup(page, backup);
  await preview.getByRole('button', { name: 'Review restore' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Restore and replace local library?' });

  const firstSafetyDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Restore library' }).click();
  await firstSafetyDownload;
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Restoring…' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p28ReleaseRestore?: () => void;
      }
    ).__p28ReleaseRestore?.();
  });

  await expect(dialog.getByRole('alert')).toContainText('Synthetic P28 restore failure');
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByLabel('Validated backup preview')).toBeVisible();

  const secondSafetyDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Restore library' }).click();
  await secondSafetyDownload;
  await waitForNotes(page);

  const titles = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.toArray()).map((note) => note.title).sort();
  });
  expect(titles).toEqual(['P28 backup source']);
});

test('Google Keep preview, busy locking, and completion focus form one continuous import workflow', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);
  await openBackupTools(page);

  await page.getByLabel('Choose Google Takeout archives').setInputFiles({
    name: 'P28 Keep.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        color: 'DEFAULT',
        isTrashed: false,
        isPinned: false,
        isArchived: false,
        textContent: 'P28 Keep import body',
        title: 'P28 Keep import',
        userEditedTimestampUsec: '1780000100000000',
        createdTimestampUsec: '1780000000000000',
      }),
    ),
  });

  const preview = page.getByLabel('Google Keep import preview');
  await expect(preview).toBeVisible();
  await expect(preview).toBeFocused();

  await page.evaluate(async () => {
    const keepModule = await import('/notes/src/features/import/googleKeepRepository.ts');
    const prototype = keepModule.GoogleKeepImportRepository.prototype;
    const original = prototype.importPrepared;
    let release: (() => void) | null = null;

    prototype.importPrepared = async function (...args: Parameters<typeof original>) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original.apply(this, args);
    };

    (
      window as typeof window & {
        __p28ReleaseKeepImport?: () => void;
      }
    ).__p28ReleaseKeepImport = () => {
      release?.();
      release = null;
    };
  });

  await preview.getByRole('button', { name: 'Import 1 note' }).click();
  await expect(preview.getByRole('checkbox').first()).toBeDisabled();
  await expect(preview.getByRole('button', { name: 'Importing…' })).toBeDisabled();

  await page.evaluate(() => {
    (
      window as typeof window & {
        __p28ReleaseKeepImport?: () => void;
      }
    ).__p28ReleaseKeepImport?.();
  });

  const result = page.getByLabel('Google Keep import result');
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(result).toContainText('Notes imported');
  await expect(result).toContainText('1');
});
