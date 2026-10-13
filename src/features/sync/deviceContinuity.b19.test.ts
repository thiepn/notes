import { describe, expect, it } from 'vitest';
import { isCurrentNativeSessionResponse, nativeDeviceRecoverySteps } from './deviceContinuity';

describe('B19 native Notes owner and token epoch fencing', () => {
  const same = {
    requestedOwner: 'owner-a',
    currentOwner: 'owner-a',
    requestedAccessToken: 'token-a',
    currentAccessToken: 'token-a',
    requestedEpoch: 3,
    currentEpoch: 3,
  };
  it('discards results after token rotation even for the same Account ID', () => {
    expect(isCurrentNativeSessionResponse(same)).toBe(true);
    expect(isCurrentNativeSessionResponse({ ...same, currentAccessToken: 'token-b' })).toBe(false);
    expect(isCurrentNativeSessionResponse({ ...same, currentEpoch: 4 })).toBe(false);
    expect(isCurrentNativeSessionResponse({ ...same, currentOwner: 'owner-b' })).toBe(false);
  });
  it('never treats a device-local backup marker as owner-verified', () => {
    const withMarker = nativeDeviceRecoverySteps({
      status: 'synced',
      lastSyncedAt: 2000,
      deviceBackupAt: 1500,
    });
    expect(withMarker[1]).toContain('not independently proven');
    const unsynced = nativeDeviceRecoverySteps({
      status: 'pending',
      lastSyncedAt: null,
      deviceBackupAt: null,
    });
    expect(unsynced[0]).toContain('Keep this device');
    expect(unsynced[1]).toContain('Backup & import');
  });
});
