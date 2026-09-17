import { describe, expect, it } from 'vitest';
import { acknowledgedShadow } from './syncState';

describe('sync acknowledgement integrity', () => {
  it('acknowledges matching content and the observed remote version', () => {
    const observed = {
      note: { localHash: 'same', remoteHash: 'same', remoteVersion: 7 },
    };
    expect(acknowledgedShadow(observed, {}, new Set())).toEqual(observed);
  });
  it('upgrades a legacy hash-only shadow when content still agrees', () => {
    const previous = { note: { localHash: 'same', remoteHash: 'same' } };
    const observed = {
      note: { localHash: 'same', remoteHash: 'same', remoteVersion: 12 },
    };
    expect(acknowledgedShadow(observed, previous, new Set())).toEqual(observed);
  });
  it('does not acknowledge an edit made while an upload was in flight', () => {
    const previous = {
      note: { localHash: 'old', remoteHash: 'old', remoteVersion: 3 },
    };
    expect(
      acknowledgedShadow(
        { note: { localHash: 'newer', remoteHash: 'new', remoteVersion: 4 } },
        previous,
        new Set(),
      ),
    ).toEqual(previous);
  });
  it('does not accept divergent first-sync snapshots as complete', () => {
    expect(
      acknowledgedShadow(
        { note: { localHash: 'newer', remoteHash: 'old', remoteVersion: 1 } },
        {},
        new Set(),
      ),
    ).toEqual({});
  });
  it('keeps deferred or failed records pending with the prior version', () => {
    const previous = { note: { localHash: 'a', remoteHash: 'a', remoteVersion: 4 } };
    expect(
      acknowledgedShadow(
        { note: { localHash: 'b', remoteHash: 'b', remoteVersion: 5 } },
        previous,
        new Set(['note']),
      ),
    ).toEqual(previous);
  });
  it('acknowledges a remote tombstone only after local deletion', () => {
    expect(
      acknowledgedShadow(
        { note: { localHash: null, remoteHash: 'deleted:123', remoteVersion: 9 } },
        {},
        new Set(),
      ),
    ).toHaveProperty('note');
    expect(
      acknowledgedShadow(
        { note: { localHash: 'still-here', remoteHash: 'deleted:123', remoteVersion: 9 } },
        {},
        new Set(),
      ),
    ).toEqual({});
  });
  it('retains failed keys even if both final snapshots omit them', () => {
    const previous = { note: { localHash: 'a', remoteHash: 'a', remoteVersion: 2 } };
    expect(acknowledgedShadow({}, previous, new Set(['note']))).toEqual(previous);
  });
});
