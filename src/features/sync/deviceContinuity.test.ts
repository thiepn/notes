import { describe, expect, it } from 'vitest';
import { createNotesNativeHandoff } from './nativeRecoveryHandoff';
import { nativeSessionTransition, compareNotesNativeDevices } from './deviceContinuity';

const ownerId = '11111111-1111-4111-8111-111111111111';
const json = JSON.stringify(createNotesNativeHandoff({
  ownerId, nativeStatus: 'synced', lastConfirmedNativeSync: 500,
  manualBackupRecordedAt: null, coreDeviceRevision: 1,
}, 1000));
describe('B18 original Notes cross-tab and cross-device recovery guards', () => {
  it('fences changed owners and externally refreshed credentials', () => {
    expect(nativeSessionTransition(ownerId, null, false)).toBe('owner-changed');
    expect(nativeSessionTransition(ownerId, ownerId, true)).toBe('external-credentials-changed');
    expect(nativeSessionTransition(ownerId, ownerId, false)).toBe('same-session');
  });
  it('never infers a matching cloud snapshot from unsigned checkpoints', () => {
    expect(compareNotesNativeDevices({
      remoteJson: json, ownerId, localStatus: 'offline',
      localLastConfirmedSync: null, now: 1200,
    }).status).toBe('local-unconfirmed');
    expect(compareNotesNativeDevices({
      remoteJson: json, ownerId, localStatus: 'synced',
      localLastConfirmedSync: 600, now: 1200,
    }).status).toBe('two-native-claims');
    expect(compareNotesNativeDevices({
      remoteJson: json, ownerId: '22222222-2222-4222-8222-222222222222',
      localStatus: 'synced', localLastConfirmedSync: 600, now: 1200,
    }).status).toBe('owner-mismatch');
  });
});
