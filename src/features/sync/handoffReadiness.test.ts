import { describe, expect, it } from 'vitest';
import { inspectOriginalNotesTransfer } from './handoffReadiness';
import type { NativeDeviceSwitchState } from './nativeDeviceSwitch';
const base: NativeDeviceSwitchState = {
  ownerId: 'owner',
  accessGranted: true,
  recoveryMode: false,
  status: 'synced',
  lastSyncedAt: 4000,
  manualBackupAt: 4500,
  now: 5000,
};
const clean = { failed: 0, deferred: 0, conflicts: 0, conflictCopies: 0 };
describe('B25 original Notes cross-device handoff readiness', () => {
  it('requires authorized native Account and a real sync result', () => {
    expect(inspectOriginalNotesTransfer({ ...base, ownerId: null }, clean).status).toBe(
      'account-required',
    );
    expect(inspectOriginalNotesTransfer(base, null).status).toBe('retry-native');
    expect(inspectOriginalNotesTransfer({ ...base, status: 'offline' }, clean).status).toBe(
      'retry-native',
    );
  });
  it('preserves failed/deferred records and conservatively recovered conflicts', () => {
    expect(inspectOriginalNotesTransfer(base, { ...clean, failed: 2 }).status).toBe(
      'pending-original-records',
    );
    expect(inspectOriginalNotesTransfer(base, { ...clean, deferred: 1 }).status).toBe(
      'pending-original-records',
    );
    expect(inspectOriginalNotesTransfer(base, { ...clean, conflictCopies: 1 }).status).toBe(
      'review-original-conflicts',
    );
  });
  it('distinguishes local export timestamp from inspected saved file', () => {
    expect(inspectOriginalNotesTransfer({ ...base, manualBackupAt: null }, clean).status).toBe(
      'export-required',
    );
    expect(inspectOriginalNotesTransfer(base, clean).status).toBe('verify-file');
  });
});
