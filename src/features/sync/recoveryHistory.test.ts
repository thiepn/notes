import { describe, expect, it } from 'vitest';
import { appendNotesRecoveryIncident, visibleNotesRecoveryIncidents } from './recoveryHistory';
describe('B16 Notes owner-specific volatile recovery history', () => {
  it('is bounded and never exposes a previous owner session', () => {
    const a = '11111111-1111-4111-8111-111111111111',
      b = '22222222-2222-4222-8222-222222222222';
    let h = {
      ownerId: null as string | null,
      entries: [] as ReturnType<typeof visibleNotesRecoveryIncidents>,
    };
    for (let i = 0; i < 15; i++) h = appendNotesRecoveryIncident(h, a, 'inspected', 1000 + i);
    expect(h.entries).toHaveLength(12);
    expect(h.entries[0]?.sequence).toBe(4);
    expect(visibleNotesRecoveryIncidents(h, b)).toHaveLength(0);
    h = appendNotesRecoveryIncident(h, b, 'core-grant-revoked', 2000);
    expect(visibleNotesRecoveryIncidents(h, a)).toHaveLength(0);
    expect(h.entries[0]?.sequence).toBe(1);
    expect(appendNotesRecoveryIncident(h, null, 'inspected', 3000).entries).toHaveLength(0);
  });
});
