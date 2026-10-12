import { describe, expect, it } from 'vitest';
import { readCoreConsentValue } from './coreConsent';

const owner = '11111111-1111-4111-8111-111111111111';
describe('B10 Core opt-in is not native Notes sync consent', () => {
  it('defaults denied and binds permission to a single owner on this device', () => {
    const allowed = JSON.stringify({ schemaVersion: 1, ownerId: owner, enabled: true });
    expect(readCoreConsentValue(null, owner)).toBe(false);
    expect(readCoreConsentValue(allowed, owner)).toBe(true);
    expect(readCoreConsentValue(allowed, '22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(
      readCoreConsentValue(
        JSON.stringify({ schemaVersion: 1, ownerId: owner, enabled: false }),
        owner,
      ),
    ).toBe(false);
    expect(
      readCoreConsentValue(
        JSON.stringify({ schemaVersion: 2, ownerId: owner, enabled: true }),
        owner,
      ),
    ).toBe(false);
    expect(readCoreConsentValue('{', owner)).toBe(false);
  });
});
