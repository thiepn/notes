import { describe, expect, it } from 'vitest';

import {
  applyReminderDatePreset,
  applyReminderQuickPreset,
  formatReminderShort,
  isReminderOverdue,
  localInputFromTimestamp,
  parseLocalReminderInput,
  reminderSnoozeTimestamp,
  reminderTimeBucket,
} from './reminderTime';

describe('reminder local time helpers', () => {
  it('round-trips an ordinary local date and time', () => {
    const timestamp = parseLocalReminderInput({ date: '2026-09-02', time: '14:30' });
    expect(localInputFromTimestamp(timestamp)).toEqual({ date: '2026-09-02', time: '14:30' });
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseLocalReminderInput({ date: '2026-02-31', time: '10:00' })).toThrow(
      'valid reminder date',
    );
  });

  it('rejects malformed or invalid clock times', () => {
    expect(() => parseLocalReminderInput({ date: '2026-09-02', time: '25:00' })).toThrow(
      'valid reminder time',
    );
  });

  it('changes only the date when applying day presets', () => {
    const now = new Date(2026, 7, 31, 21, 0, 0, 0).getTime();
    expect(applyReminderDatePreset({ date: '2026-08-31', time: '08:45' }, 1, now)).toEqual({
      date: '2026-09-01',
      time: '08:45',
    });
  });

  it('provides fast scheduling presets without changing storage semantics', () => {
    const now = new Date(2026, 8, 2, 10, 17, 0, 0).getTime();
    expect(applyReminderQuickPreset('in-one-hour', now)).toEqual(
      localInputFromTimestamp(now + 60 * 60 * 1000),
    );
    expect(applyReminderQuickPreset('tomorrow-morning', now)).toEqual({
      date: '2026-09-03',
      time: '09:00',
    });
    expect(applyReminderQuickPreset('next-week-morning', now)).toEqual({
      date: '2026-09-09',
      time: '09:00',
    });
  });

  it('provides richer snooze targets', () => {
    const now = new Date(2026, 8, 2, 22, 40, 0, 0).getTime();
    expect(reminderSnoozeTimestamp('ten-minutes', now)).toBe(now + 10 * 60 * 1000);
    expect(reminderSnoozeTimestamp('one-hour', now)).toBe(now + 60 * 60 * 1000);
    expect(localInputFromTimestamp(reminderSnoozeTimestamp('tomorrow-morning', now))).toEqual({
      date: '2026-09-03',
      time: '09:00',
    });
  });

  it('groups future reminders by local calendar day rather than elapsed hours', () => {
    const now = new Date(2026, 8, 2, 23, 45, 0, 0).getTime();
    expect(reminderTimeBucket(new Date(2026, 8, 2, 23, 55).getTime(), now)).toBe('today');
    expect(reminderTimeBucket(new Date(2026, 8, 3, 0, 5).getTime(), now)).toBe('tomorrow');
    expect(reminderTimeBucket(new Date(2026, 8, 8, 9, 0).getTime(), now)).toBe('next-seven-days');
    expect(reminderTimeBucket(new Date(2026, 8, 10, 9, 0).getTime(), now)).toBe('later');
  });

  it('marks past reminders as overdue and exposes that state in short labels', () => {
    const now = new Date(2026, 8, 2, 10, 17, 0, 0).getTime();
    const dueAt = new Date(2026, 8, 2, 9, 0, 0, 0).getTime();
    expect(isReminderOverdue(dueAt, now)).toBe(true);
    expect(reminderTimeBucket(dueAt, now)).toBe('overdue');
    expect(formatReminderShort(dueAt, now)).toMatch(/^Overdue · Today,/u);
  });
});
