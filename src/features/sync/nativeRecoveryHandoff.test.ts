import { describe, expect, it } from 'vitest';
import { createNotesNativeHandoff, inspectNotesNativeHandoff } from './nativeRecoveryHandoff';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const base = {
  ownerId: owner,
  nativeStatus: 'synced' as const,
  lastConfirmedNativeSync: 1000,
  manualBackupRecordedAt: 900,
  coreDeviceRevision: 4,
};
describe('B17 native Notes independent device summary boundaries', () => {
  it('keeps private Notes content and tokens out of owner-mediated summaries', () => {
    const packet = createNotesNativeHandoff(base, 2000);
    expect(packet.nativeImport).toBe('NOT_PERFORMED');
    expect(packet.externalCustody).toBe('NOT_TESTED');
    expect(JSON.stringify(packet)).not.toContain('access_token');
    expect(inspectNotesNativeHandoff(JSON.stringify(packet), owner, 2500).status).toBe('candidate');
    expect(inspectNotesNativeHandoff(JSON.stringify(packet), other, 2500).status).toBe(
      'owner-mismatch',
    );
  });
  it('does not treat pending, unauthenticated, stale or malformed evidence as recovered', () => {
    const pending = createNotesNativeHandoff({ ...base, nativeStatus: 'pending' }, 2000);
    expect(inspectNotesNativeHandoff(JSON.stringify(pending), owner, 2500).status).toBe(
      'unconfirmed',
    );
    const stale = createNotesNativeHandoff(base, 2000);
    expect(inspectNotesNativeHandoff(JSON.stringify(stale), owner, 86_405_000).status).toBe(
      'stale',
    );
    expect(
      inspectNotesNativeHandoff(
        JSON.stringify({ ...stale, externalCustody: 'CERTIFIED' }),
        owner,
        2500,
      ).status,
    ).toBe('invalid');
    expect(
      inspectNotesNativeHandoff(
        JSON.stringify({ ...stale, lastConfirmedNativeSync: 900000 }),
        owner,
        2500,
      ).status,
    ).toBe('invalid');
    expect(inspectNotesNativeHandoff('{bad', owner, 2500).status).toBe('invalid');
  });
});
