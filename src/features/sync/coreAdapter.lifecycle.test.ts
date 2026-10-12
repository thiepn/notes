import { describe, expect, it } from 'vitest';
import { canRequestNotesCoreSync } from './coreAdapter';
describe('B11 owner transfer and recovery permissions', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  it('blocks signed-out, wrong-owner, missing grant and recovery modes', () => {
    expect(
      canRequestNotesCoreSync({ ownerId: null, authorized: true, state: 'synced' }, owner),
    ).toBe(false);
    expect(
      canRequestNotesCoreSync({ ownerId: owner, authorized: false, state: 'synced' }, owner),
    ).toBe(false);
    expect(
      canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'recovery' }, owner),
    ).toBe(false);
    expect(
      canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'offline' }, owner),
    ).toBe(false);
    expect(
      canRequestNotesCoreSync({ ownerId: owner, authorized: true, state: 'pending' }, owner),
    ).toBe(true);
  });
});
