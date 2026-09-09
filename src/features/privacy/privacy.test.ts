import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVACY_PREFERENCES,
  PRIVACY_LOCK_ITERATIONS,
  PRIVACY_MAX_UNLOCK_DELAY_MS,
  normalizePrivacyPreferences,
  privacyAutoLockDelayMs,
  privacyCredentialNeedsUpgrade,
  privacyNotificationCopy,
  privacyUnlockDelayMs,
  validatePrivacyPasscode,
} from './privacy';

describe('privacy helpers', () => {
  it('normalizes malformed preferences to safe defaults', () => {
    expect(
      normalizePrivacyPreferences({
        hidePreviews: true,
        privateNotifications: false,
        autoLockMinutes: 15,
      }),
    ).toEqual({
      hidePreviews: true,
      privateNotifications: false,
      autoLockMinutes: 15,
    });
    expect(normalizePrivacyPreferences({ autoLockMinutes: 999 })).toEqual(
      DEFAULT_PRIVACY_PREFERENCES,
    );
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

  it('marks older PBKDF2 credentials for opportunistic work-factor upgrade', () => {
    expect(PRIVACY_LOCK_ITERATIONS).toBe(600_000);
    expect(
      privacyCredentialNeedsUpgrade({
        version: 1,
        salt: '00'.repeat(16),
        hash: '11'.repeat(32),
        iterations: 120_000,
      }),
    ).toBe(true);
    expect(
      privacyCredentialNeedsUpgrade({
        version: 1,
        salt: '00'.repeat(16),
        hash: '11'.repeat(32),
        iterations: PRIVACY_LOCK_ITERATIONS,
      }),
    ).toBe(false);
  });

  it('adds bounded progressive delays only after repeated failed unlocks', () => {
    expect(privacyUnlockDelayMs(1)).toBe(0);
    expect(privacyUnlockDelayMs(2)).toBe(0);
    expect(privacyUnlockDelayMs(3)).toBe(2_000);
    expect(privacyUnlockDelayMs(4)).toBe(5_000);
    expect(privacyUnlockDelayMs(5)).toBe(15_000);
    expect(privacyUnlockDelayMs(6)).toBe(30_000);
    expect(privacyUnlockDelayMs(7)).toBe(PRIVACY_MAX_UNLOCK_DELAY_MS);
    expect(privacyUnlockDelayMs(100)).toBe(PRIVACY_MAX_UNLOCK_DELAY_MS);
  });
});
