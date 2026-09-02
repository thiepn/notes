import { expect, test, type Page } from '@playwright/test';

async function waitForNotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

async function openBackup(page: Page) {
  await page.getByRole('button', { name: 'Backup' }).click();
  await expect(page.getByRole('heading', { name: 'Back up this device' })).toBeVisible();
}

test('backup readiness shows current library counts and remembers the latest manual download', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const reminders = new db.RemindersRepository(db.notesDatabase);
    const first = await notes.create({ title: 'Ready one', content: 'First local note' });
    await notes.create({ title: 'Ready two', content: 'Second local note' });
    await reminders.set(first.id, {
      dueAt: Date.now() + 60 * 60 * 1000,
      timeZone: 'Europe/Berlin',
    });
    const bytes = new TextEncoder().encode('backup readiness attachment');
    await db.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: first.id,
      name: 'readiness.txt',
      mimeType: 'text/plain',
      size: bytes.byteLength,
      checksum: 'readiness-checksum',
      data: new Blob([bytes], { type: 'text/plain' }),
      createdAt: Date.now(),
    });
  });

  await openBackup(page);
  const readiness = page.getByLabel('Current backup readiness');
  await expect(readiness).toContainText('2 notes');
  await expect(readiness).toContainText('1 attachment');
  await expect(readiness).toContainText('1 reminder');
  await expect(readiness).toContainText('No manual backup recorded on this browser yet');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download full backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^notes-backup-.*\.json$/u);
  await expect(page.getByRole('status')).toContainText('Full backup downloaded as');
  await expect(page.getByRole('status')).toContainText('database records were validated');

  const activity = await page.evaluate(() => {
    const raw = localStorage.getItem('notes.backup.last-manual.v1');
    return raw ? (JSON.parse(raw) as { exportedAt: number; filename: string; fileBytes: number }) : null;
  });
  expect(activity).not.toBeNull();
  expect(activity?.filename).toBe(download.suggestedFilename());
  expect(activity?.fileBytes).toBeGreaterThan(0);
  expect(activity?.exportedAt).toBeGreaterThan(0);

  await page.reload();
  await openBackup(page);
  const lastBackup = page
    .getByLabel('Current backup readiness')
    .locator('div')
    .filter({ hasText: 'Last manual backup' })
    .first();
  await expect(lastBackup).toContainText('Just now');
});

test('validated recovery preview compares current and incoming libraries without mutating either', async ({
  page,
}) => {
  await page.goto('./');
  await waitForNotes(page);

  const backupJson = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    await notes.create({ title: 'Backup source', content: 'One-note recovery snapshot' });
    const backup = await import('/notes/src/features/backup/backupRepository.ts');
    return (await new backup.BackupRepository(db.notesDatabase).exportBackup()).json;
  });

  await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = new db.NotesRepository(db.notesDatabase);
    const first = await notes.create({ title: 'Current extra one', content: '' });
    await notes.create({ title: 'Current extra two', content: '' });
    const bytes = new TextEncoder().encode('current-only attachment');
    await db.notesDatabase.attachments.add({
      id: crypto.randomUUID(),
      noteId: first.id,
      name: 'current-only.txt',
      mimeType: 'text/plain',
      size: bytes.byteLength,
      checksum: 'current-only-checksum',
      data: new Blob([bytes], { type: 'text/plain' }),
      createdAt: Date.now(),
    });
  });

  await openBackup(page);
  await page.getByLabel('Choose backup file').setInputFiles({
    name: 'recovery-preview.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupJson),
  });

  const preview = page.getByLabel('Validated backup preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Backup v2 · Database v2');
  await expect(preview).toContainText('Just now');
  const comparison = preview.getByRole('table', { name: 'Current library versus backup' });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByRole('row', { name: /Notes\s+3\s+1\s+-2/u })).toBeVisible();
  await expect(comparison.getByRole('row', { name: /Attachments\s+1\s+0\s+-1/u })).toBeVisible();

  const currentTitles = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    return (await db.notesDatabase.notes.toArray()).map((note) => note.title).sort();
  });
  expect(currentTitles).toEqual(['Backup source', 'Current extra one', 'Current extra two']);
});
