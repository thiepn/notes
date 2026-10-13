import { describe, expect, it } from 'vitest';
import { nextOriginalDeviceAction } from './nativeDeviceSwitch';
const state = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  accessGranted: true,
  recoveryMode: false,
  status: 'pending' as const,
  lastSyncedAt: null,
  manualBackupAt: null,
  now: 1000,
};
describe('B21 original Notes device switch actions', () => {
  it('routes pending Notes to its own sync engine, without certification', () => {
    expect(nextOriginalDeviceAction(state)).toBe('retry-native');
    expect(nextOriginalDeviceAction({ ...state, status: 'offline' })).toBe('retry-native');
  });
  it('keeps unsigned backup markers and account recovery on original pathways', () => {
    expect(nextOriginalDeviceAction({ ...state, recoveryMode: true })).toBe('finish-account');
    expect(nextOriginalDeviceAction({ ...state, ownerId: null })).toBe('open-backup');
    expect(nextOriginalDeviceAction({ ...state, status: 'synced', lastSyncedAt: 200 })).toBe(
      'open-backup',
    );
    expect(
      nextOriginalDeviceAction({
        ...state,
        status: 'synced',
        lastSyncedAt: 200,
        manualBackupAt: 100,
      }),
    ).toBe('verify-export');
  });
});
