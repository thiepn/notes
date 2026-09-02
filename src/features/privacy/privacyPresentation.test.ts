import { describe, expect, it } from 'vitest';

import {
  formatPrivacyAutoLockPolicy,
  privacyModeMenuLabel,
  privacyProtectionSummary,
} from './privacyPresentation';

describe('privacy polish presentation helpers', () => {
  it('summarizes passive privacy controls without implying encryption', () => {
    expect(
      privacyProtectionSummary({
        lockEnabled: true,
        hidePreviews: true,
        privateNotifications: true,
      }),
    ).toEqual({
      enabledCount: 3,
      totalCount: 3,
      label: 'All passive privacy controls are on',
      detail: 'privacy lock enabled · card previews hidden · notification details hidden',
    });

    expect(
      privacyProtectionSummary({
        lockEnabled: false,
        hidePreviews: true,
        privateNotifications: false,
      }).label,
    ).toBe('1 of 3 passive privacy controls is on');
  });

  it('describes auto-lock policies clearly', () => {
    expect(formatPrivacyAutoLockPolicy(5, false)).toMatch(/available after privacy lock/u);
    expect(formatPrivacyAutoLockPolicy(null, true)).toBe(
      'Automatic locking while hidden is disabled.',
    );
    expect(formatPrivacyAutoLockPolicy(0, true)).toBe(
      'Locks immediately when Notes becomes hidden.',
    );
    expect(formatPrivacyAutoLockPolicy(1, true)).toBe('Locks after 1 minute hidden.');
    expect(formatPrivacyAutoLockPolicy(15, true)).toBe('Locks after 15 minutes hidden.');
  });

  it('uses action-oriented privacy mode menu labels', () => {
    expect(privacyModeMenuLabel(false)).toBe('Hide note previews');
    expect(privacyModeMenuLabel(true)).toBe('Show note previews');
  });
});
