import { describe, expect, it } from 'vitest';
import { originalNotesAuthorityCurrent } from './nativeSyncPause';
describe('B26 Notes owner/device local pause and stale-result fencing', () => {
  const base = { epoch: 2, currentEpoch: 2, ownerId: 'owner-a',
    currentOwnerId: 'owner-a', paused: false, accessGranted: true };
  it('allows only original currently-authorized owner sync', () => {
    expect(originalNotesAuthorityCurrent(base)).toBe(true);
    expect(originalNotesAuthorityCurrent({ ...base, currentEpoch: 3 })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, currentOwnerId: 'owner-b' })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, paused: true })).toBe(false);
    expect(originalNotesAuthorityCurrent({ ...base, accessGranted: false })).toBe(false);
  });
});
