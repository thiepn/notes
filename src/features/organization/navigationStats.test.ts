import { describe, expect, it } from 'vitest';

import { countLabels } from './navigationStats';

describe('navigation stats', () => {
  it('counts active-note label membership without double-counting malformed duplicate links', () => {
    expect(
      countLabels({
        a: ['study', 'missions'],
        b: ['study'],
        c: ['church', 'church'],
        d: [],
      }),
    ).toEqual({
      study: 2,
      missions: 1,
      church: 1,
    });
  });

  it('returns an empty count map for an empty active collection', () => {
    expect(countLabels({})).toEqual({});
  });
});
