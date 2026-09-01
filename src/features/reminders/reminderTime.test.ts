import { describe, expect, it } from 'vitest';

import {
  applyReminderDatePreset,
  localInputFromTimestamp,
  parseLocalReminderInput,
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
});
