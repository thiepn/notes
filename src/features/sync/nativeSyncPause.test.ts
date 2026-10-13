import { describe, expect, it } from 'vitest';
import {
  isNotesNativePauseStorageEvent,
  originalNotesAuthorityCurrent,
  NOTES_NATIVE_SYNC_PAUSE_KEY,
} from './nativeSyncPause';
describe('B26 Notes owner/device local pause and stale-result fencing', () => {
  it('recognizes owner-scoped changes from another same-origin tab', () => {
    expect(isNotesNativePauseStorageEvent(NOTES_NATIVE_SYNC_PAUSE_KEY + ':owner-a')).toBe(true);
    expect(isNotesNativePauseStorageEvent(NOTES_NATIVE_SYNC_PAUSE_KEY)).toBe(true);
    expect(isNotesNativePauseStorageEvent('other-key')).toBe(false);
    expect(isNotesNativePauseStorageEvent(null)).toBe(false);
  });
  const base = {
    epoch: 2,
    currentEpoch: 2,
    ownerId: 'owner-a',
    currentOwnerId: 'owner-a',
    paused: false,
    accessGranted: true,
  };
  it('allows only original currently-authorized owner sync', () => {
    expect(originalNotesAuthorityCurrent(base)).toBe(true);
    expect(originalNotesAuthorityCurrent({ ...base, currentEpoch: 3 })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, currentOwnerId: 'owner-b' })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, paused: true })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, accessGranted: false })).toBe(false);
  });
});
