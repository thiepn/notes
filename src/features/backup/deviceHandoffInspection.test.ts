import { describe, expect, it } from 'vitest';
import { inspectSavedNotesHandoff } from './deviceHandoffInspection';

describe('B22 original Notes saved backup handoff validation', () => {
  it('keeps an unselected file unverified and never imports', () => {
    expect(
      inspectSavedNotesHandoff({
        validated: false,
        size: 0,
        exportedAt: null,
        now: 5000,
      }).status,
    ).toBe('not-inspected');
  });
  it('accepts only original BackupRepository validated files with plausible time', () => {
    expect(
      inspectSavedNotesHandoff({
        validated: true,
        size: 400,
        exportedAt: 4000,
        now: 5000,
      }).status,
    ).toBe('validated-local-file');
    expect(
      inspectSavedNotesHandoff({
        validated: true,
        size: 400,
        exportedAt: 999999999,
        now: 5000,
      }).status,
    ).toBe('file-clock-invalid');
    expect(
      inspectSavedNotesHandoff({
        validated: true,
        size: 400,
        exportedAt: 4000,
        now: 5000,
      }).independentCustody,
    ).toBe('NOT_TESTED');
  });
});
