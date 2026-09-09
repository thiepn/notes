import { describe, expect, it } from 'vitest';

import { conflictCopyTitle } from './conflictPreservation';

describe('conflict copy titles', () => {
  it('makes the source and timestamp visible and searchable', () => {
    expect(conflictCopyTitle('Shared draft', 'cloud', Date.UTC(2026, 8, 9, 20, 15, 0))).toBe(
      'Shared draft — conflict copy (cloud, 2026-09-09 20:15:00Z)',
    );
    expect(
      conflictCopyTitle('Shared draft', 'this-device', Date.UTC(2026, 8, 9, 20, 15, 0)),
    ).toContain('conflict copy (this device');
  });

  it('keeps generated titles within the note title limit and names untitled notes', () => {
    const long = conflictCopyTitle('A'.repeat(600), 'cloud', 0);
    expect(long.length).toBeLessThanOrEqual(500);
    expect(long).toContain('conflict copy');
    expect(conflictCopyTitle('   ', 'cloud', 0)).toMatch(/^Untitled — conflict copy/u);
  });
});
