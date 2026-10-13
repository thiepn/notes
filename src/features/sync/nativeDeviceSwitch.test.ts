import { describe, expect, it } from 'vitest';
import { inspectNativeDeviceSwitch } from './nativeDeviceSwitch';
const state = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  accessGranted: true,
  recoveryMode: false,
  status: 'synced' as const,
  lastSyncedAt: 500,
  manualBackupAt: 400,
  now: 1000,
};
describe('B20 native Notes original device switch checks', () => {
  it('never treats original BackupWorkspace marker as independently saved or attributed', () => {
    const result = inspectNativeDeviceSwitch(state);
    expect(result.status).toBe('manual-verification-needed');
    expect(result.next).toContain('Neither proves');
    expect(result.externalCustody).toBe('NOT_TESTED');
  });
  it('blocks sign-out, recovery mode, pending sync and nonexistent backup', () => {
    expect(inspectNativeDeviceSwitch({ ...state, ownerId: null }).status).toBe('local-only');
    expect(inspectNativeDeviceSwitch({ ...state, recoveryMode: true }).status).toBe(
      'account-action-required',
    );
    expect(inspectNativeDeviceSwitch({ ...state, status: 'pending' }).status).toBe(
      'native-not-confirmed',
    );
    expect(inspectNativeDeviceSwitch({ ...state, manualBackupAt: null }).status).toBe(
      'backup-not-evidenced',
    );
    expect(inspectNativeDeviceSwitch({ ...state, lastSyncedAt: 2000 }).status).toBe(
      'native-not-confirmed',
    );
  });
});
