import { describe, expect, it } from 'vitest';

import {
  INITIAL_MOUNTED_NOTE_COUNT,
  MOBILE_INITIAL_MOUNTED_NOTE_COUNT,
  TABLET_INITIAL_MOUNTED_NOTE_COUNT,
  resolveNoteMountProfile,
} from './MasonryGrid';

describe('adaptive note mounting profiles', () => {
  it('uses smaller initial card windows on mobile and tablet breakpoints', () => {
    expect(resolveNoteMountProfile(320)).toMatchObject({
      name: 'mobile',
      initial: MOBILE_INITIAL_MOUNTED_NOTE_COUNT,
      batch: 48,
    });
    expect(resolveNoteMountProfile(767).name).toBe('mobile');
    expect(resolveNoteMountProfile(768)).toMatchObject({
      name: 'tablet',
      initial: TABLET_INITIAL_MOUNTED_NOTE_COUNT,
      batch: 72,
    });
    expect(resolveNoteMountProfile(1100).name).toBe('tablet');
    expect(resolveNoteMountProfile(1101)).toMatchObject({
      name: 'desktop',
      initial: INITIAL_MOUNTED_NOTE_COUNT,
      batch: 96,
    });
  });

  it('falls back to the desktop profile for unusable widths', () => {
    expect(resolveNoteMountProfile(Number.NaN).name).toBe('desktop');
    expect(resolveNoteMountProfile(0).name).toBe('desktop');
    expect(resolveNoteMountProfile(-1).name).toBe('desktop');
  });
});
