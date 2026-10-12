import { describe, expect, it } from 'vitest';
import {
  appendRecoveryEntry,
  nativeRecoveryEvidence,
  visibleRecoveryEntries,
  type RecoveryHistory,
} from './recoveryHistory';

const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';
describe('B16 owner-scoped original Notes incident history', () => {
  it('does not leak history across accounts and caps local observations', () => {
    let history: RecoveryHistory = { ownerId: null, entries: [] };
    for (let i = 0; i < 20; i++) {
      history = appendRecoveryEntry(
        history,
        one,
        {
          action: 'native-retry-requested',
          nativeStatus: 'pending',
          grantRevision: 3,
          lastConfirmedNativeSync: null,
        },
        i + 100,
      );
    }
    expect(visibleRecoveryEntries(history, one)).toHaveLength(16);
    expect(visibleRecoveryEntries(history, two)).toEqual([]);
    expect(history.entries[0]?.at).toBe(104);
    history = appendRecoveryEntry(
      history,
      two,
      {
        action: 'core-device-revoked',
        nativeStatus: 'offline',
        grantRevision: 4,
        lastConfirmedNativeSync: null,
      },
      200,
    );
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]?.externalCustody).toBe('NOT_TESTED');
    expect(visibleRecoveryEntries(history, one)).toEqual([]);
  });
  it('does not turn retry, pending or offline into cloud proof', () => {
    expect(nativeRecoveryEvidence('pending', 20).confirmed).toBe(false);
    expect(nativeRecoveryEvidence('offline', null).confirmed).toBe(false);
    expect(nativeRecoveryEvidence('synced', 20).confirmed).toBe(true);
    expect(nativeRecoveryEvidence('error', 20).detail).toContain('BackupWorkspace');
  });
});
