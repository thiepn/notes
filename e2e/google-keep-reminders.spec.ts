import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

function takeoutWithReminder(): Buffer {
  return Buffer.from(
    zipSync({
      'Takeout/Keep/Reminder note.json': strToU8(
        JSON.stringify({
          title: 'Imported reminder',
          textContent: 'Call after lunch',
          color: 'DEFAULT',
          isPinned: false,
          isArchived: false,
          isTrashed: false,
          createdTimestampUsec: '1780000000000000',
          userEditedTimestampUsec: '1780000100000000',
          reminders: [{ triggerTimeUsec: '1780003600000000' }],
        }),
      ),
      'Takeout/Keep/Unknown reminder.json': strToU8(
        JSON.stringify({
          title: 'Unknown reminder metadata',
          textContent: 'Do not guess',
          color: 'DEFAULT',
          createdTimestampUsec: '1780000200000000',
          userEditedTimestampUsec: '1780000300000000',
          reminder: { recurrenceRule: 'mystery-shape-without-time' },
        }),
      ),
    }),
  );
}

test('recognized Keep reminder timestamps import while unknown reminder shapes only warn', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Backup' }).click();

  await page.getByLabel('Choose Google Takeout archives').setInputFiles({
    name: 'takeout-reminders.zip',
    mimeType: 'application/zip',
    buffer: takeoutWithReminder(),
  });

  const preview = page.getByLabel('Google Keep import preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('warning');
  await expect(preview).toContainText('timestamp shape was not recognized');
  await preview.getByRole('button', { name: 'Import 2 notes' }).click();

  const state = await page.evaluate(async () => {
    const db = await import('/notes/src/db/index.ts');
    const notes = await db.notesDatabase.notes.toArray();
    const reminders = await db.notesDatabase.reminders.toArray();
    const imported = notes.find((note) => note.title === 'Imported reminder');
    const unknown = notes.find((note) => note.title === 'Unknown reminder metadata');
    return {
      reminderCount: reminders.length,
      importedReminder: imported
        ? (reminders.find((reminder) => reminder.noteId === imported.id) ?? null)
        : null,
      unknownHasReminder: unknown
        ? reminders.some((reminder) => reminder.noteId === unknown.id)
        : null,
    };
  });

  expect(state.reminderCount).toBe(1);
  expect(state.importedReminder).toEqual(
    expect.objectContaining({
      dueAt: 1_780_003_600_000,
      timeZone: 'UTC',
      status: 'active',
    }),
  );
  expect(state.unknownHasReminder).toBe(false);
});
