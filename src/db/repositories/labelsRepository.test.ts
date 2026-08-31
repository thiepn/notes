import { describe, expect, it } from 'vitest';

import { normalizeLabelName } from './labelsRepository';

describe('label normalization', () => {
  it('trims, collapses whitespace, and compares case-insensitively', () => {
    expect(normalizeLabelName('  Project   Ideas  ')).toBe('project ideas');
    expect(normalizeLabelName('PROJECT IDEAS')).toBe('project ideas');
  });

  it('normalizes compatibility Unicode forms', () => {
    expect(normalizeLabelName('ＦｕｌｌＷｉｄｔｈ')).toBe('fullwidth');
  });

  it('rejects empty labels', () => {
    expect(() => normalizeLabelName('   ')).toThrow('Label name cannot be empty.');
  });
});
