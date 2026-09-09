import { describe, expect, it } from 'vitest';
import { acknowledgedShadow } from './syncState';

describe('sync acknowledgement integrity', () => {
  it('acknowledges matching content', () => {
    const observed = { note: { localHash: 'same', remoteHash: 'same' } };
    expect(acknowledgedShadow(observed, {}, new Set())).toEqual(observed);
  });
  it('does not acknowledge an edit made while an upload was in flight', () => {
    const previous = { note: { localHash: 'old', remoteHash: 'old' } };
    expect(
      acknowledgedShadow({ note: { localHash: 'newer', remoteHash: 'new' } }, previous, new Set()),
    ).toEqual(previous);
  });
  it('does not accept divergent first-sync snapshots as complete', () => {
    expect(
      acknowledgedShadow({ note: { localHash: 'newer', remoteHash: 'old' } }, {}, new Set()),
    ).toEqual({});
  });
  it('keeps deferred or failed records pending', () => {
    const previous = { note: { localHash: 'a', remoteHash: 'a' } };
    expect(
      acknowledgedShadow(
        { note: { localHash: 'b', remoteHash: 'b' } },
        previous,
        new Set(['note']),
      ),
    ).toEqual(previous);
  });
  it('acknowledges a remote tombstone only after local deletion', () => {
    expect(
      acknowledgedShadow({ note: { localHash: null, remoteHash: 'deleted:123' } }, {}, new Set()),
    ).toHaveProperty('note');
    expect(
      acknowledgedShadow(
        { note: { localHash: 'still-here', remoteHash: 'deleted:123' } },
        {},
        new Set(),
      ),
    ).toEqual({});
  });
  it('retains failed keys even if both final snapshots omit them', () => {
    const previous = { note: { localHash: 'a', remoteHash: 'a' } };
    expect(acknowledgedShadow({}, previous, new Set(['note']))).toEqual(previous);
  });
});
