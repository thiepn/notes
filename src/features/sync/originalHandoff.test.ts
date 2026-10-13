import { describe, expect, it } from 'vitest';
import { assessOriginalNotesHandoff } from './originalHandoff';
const ownerId = '11111111-1111-4111-8111-111111111111';
const good = {
  ownerId, accessGranted: true, recoveryMode: false, status: 'synced' as const,
  lastSyncedAt: 900, failed: 0, deferred: 0, conflicts: 0,
  manualBackupAt: 800, now: 1000,
};
describe('B22 original Notes handoff status follows actual SyncProvider outcomes', () => {
  it('never certifies signed-out or still-running original sync', () => {
    expect(assessOriginalNotesHandoff({ ...good, ownerId: null }).phase).toBe('account-required');
    expect(assessOriginalNotesHandoff({ ...good, status: 'syncing' }).phase).toBe('native-in-progress');
    expect(assessOriginalNotesHandoff({ ...good, deferred: 1 }).phase).toBe('native-pending');
    expect(assessOriginalNotesHandoff({ ...good, failed: 1 }).phase).toBe('native-pending');
  });
  it('distinguishes original conflict handling from local backup file verification', () => {
    expect(assessOriginalNotesHandoff({ ...good, conflicts: 1 }).phase).toBe('review-conflicts');
    expect(assessOriginalNotesHandoff({ ...good, manualBackupAt: null }).phase).toBe('backup-needed');
    const observed = assessOriginalNotesHandoff(good);
    expect(observed.phase).toBe('verify-saved-file');
    expect(observed.action).toContain('not owner-attributed');
    expect(observed.externalCustody).toBe('NOT_TESTED');
    expect(observed.nativeImport).toBe('NOT_PERFORMED');
  });
});
