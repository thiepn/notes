import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Europe/Berlin' });

test('reminder scheduling rejects nonexistent DST wall-clock times and captures the local zone', async ({
  page,
}) => {
  await page.goto('./');

  const result = await page.evaluate(async () => {
    const reminderTime = await import('/notes/src/features/reminders/reminderTime.ts');
    let springGapError = '';
    try {
      reminderTime.parseLocalReminderInput({ date: '2026-03-29', time: '02:30' });
    } catch (error) {
      springGapError = error instanceof Error ? error.message : 'unknown';
    }

    const ordinary = reminderTime.parseLocalReminderInput({ date: '2026-03-29', time: '03:30' });
    const autumnAmbiguous = reminderTime.parseLocalReminderInput({
      date: '2026-10-25',
      time: '02:30',
    });

    return {
      timeZone: reminderTime.currentTimeZone(),
      springGapError,
      ordinaryRoundTrip: reminderTime.localInputFromTimestamp(ordinary),
      autumnIsFinite: Number.isFinite(autumnAmbiguous),
    };
  });

  expect(result.timeZone).toBe('Europe/Berlin');
  expect(result.springGapError).toContain('daylight-saving time change');
  expect(result.ordinaryRoundTrip).toEqual({ date: '2026-03-29', time: '03:30' });
  expect(result.autumnIsFinite).toBe(true);
});
