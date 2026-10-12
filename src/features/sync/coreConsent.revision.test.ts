import { describe, expect, it } from 'vitest';
import { getNotesCoreRevision, readCoreConsentValue } from './coreConsent';
describe('B13 app-owned device grant rotation', () => {
  it('allows only exact owner and revisioned permission', () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const granted = JSON.stringify({ schemaVersion: 1, ownerId: owner, enabled: true, revision: 8 });
    expect(readCoreConsentValue(granted, owner)).toBe(true);
    expect(readCoreConsentValue(granted, '22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(readCoreConsentValue(JSON.stringify({schemaVersion:1,ownerId:owner,enabled:false,revision:9}),owner)).toBe(false);
    expect(getNotesCoreRevision(null)).toBeNull();
  });
});
