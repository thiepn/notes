import { describe, expect, it } from 'vitest';

import { canRequestNotesCoreSync } from './coreAdapter';

const owner = '11111111-1111-4111-8111-111111111111';
describe('B9 native Notes Core port authorization', () => {
  it('only allows an existing connected workspace for the same owner', () => {
    expect(canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'synced' }, owner)).toBe(true);
    expect(canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'pending' }, owner)).toBe(true);
    expect(canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'synced' }, 'other-owner')).toBe(false);
    expect(canRequestNotesCoreSync({ ownerId: owner, authorized: false, state: 'synced' }, owner)).toBe(false);
    for (const state of ['local', 'setup', 'recovery', 'offline', 'connecting'] as const) {
      expect(canRequestNotesCoreSync({ ownerId: owner, authorized: true, state }, owner)).toBe(false);
    }
  });
});
