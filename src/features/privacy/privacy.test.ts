import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVACY_PREFERENCES,
  normalizePrivacyPreferences,
  privacyAutoLockDelayMs,
  privacyNotificationCopy,
  validatePrivacyPasscode,
} from './privacy';

describe('privacy helpers', () => {
  it('normalizes malformed preferences to safe defaults', () => {
    expect(normalizePrivacyPreferences({ hidePreviews: true, privateNotifications: false, autoLockMinutes: 15 })).toEqual({
      hidePreviews: true,
      privateNotifications: false,
      autoLockMinutes: 15,
    });
    expect(normalizePrivacyPreferences({ autoLockMinutes: 999 })).toEqual(DEFAULT_PRIVACY_PREFERENCES);
    expect(normalizePrivacyPreferences(null)).toEqual(DEFAULT_PRIVACY_PREFERENCES);
  });

  it('converts supported auto-lock values into delays', () => {
    expect(privacyAutoLockDelayMs(null)).toBeNull();
    expect(privacyAutoLockDelayMs(0)).toBe(0);
    expect(privacyAutoLockDelayMs(5)).toBe(300_000);
  });

  it('redacts notification title and body when privacy is required', () => {
    const note = { title: 'Medical appointment', content: 'Private details here' };
    expect(privacyNotificationCopy(note, true)).toEqual({
      title: 'Notes reminder',
      body: 'Open Notes to view this reminder.',
    });
    expect(privacyNotificationCopy(note, false)).toEqual({
      title: 'Medical appointment',
      body: 'Private details here',
    });
  });

  it('requires a non-trivial local passcode length', () => {
    expect(validatePrivacyPasscode('123')).toMatch(/at least 4/u);
    expect(validatePrivacyPasscode('1234')).toBeNull();
  });
});
