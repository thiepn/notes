import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  changeNotesCoreConsent,
  getNotesCoreRevision,
  hasNotesCoreConsent,
  revokeNotesCoreOnAccountExit,
} from './coreConsent';
describe('B14 Notes native device revocation on account exit', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('rotates the local per-owner revision before signout while preserving other owners', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    });
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    expect(changeNotesCoreConsent(owner, true)).toBe(true);
    expect(changeNotesCoreConsent(other, true)).toBe(true);
    const before = getNotesCoreRevision(owner)!;
    expect(revokeNotesCoreOnAccountExit(owner)).toBe(true);
    expect(hasNotesCoreConsent(owner)).toBe(false);
    expect(hasNotesCoreConsent(other)).toBe(true);
    expect(changeNotesCoreConsent(owner, true)).toBe(true);
    expect(getNotesCoreRevision(owner)).toBeGreaterThan(before);
  });
  it('fails closed without a signed-in owner or available storage', () => {
    expect(revokeNotesCoreOnAccountExit(null)).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      },
    });
    expect(hasNotesCoreConsent('owner')).toBe(false);
    expect(revokeNotesCoreOnAccountExit('owner')).toBe(false);
  });
});
