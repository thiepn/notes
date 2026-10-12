import { describe, expect, it } from 'vitest';
import { requestOwnedNotesSync } from './coreRequest';
import type { NotesCorePermission } from './coreAdapter';

const owner = '11111111-1111-4111-8111-111111111111';
const permission = (): NotesCorePermission => ({
  ownerId: owner, authorized: true, state: 'pending',
});
describe('B11 Notes consent and owner changes during original native sync', () => {
  it('denies wrong owner or absent permission without invoking Notes', async () => {
    let calls = 0;
    expect(await requestOwnedNotesSync('different', permission, async () => { calls++; })).toBe('denied');
    expect(await requestOwnedNotesSync(owner, () => ({...permission(), authorized:false}), async()=>{calls++;})).toBe('denied');
    expect(calls).toBe(0);
  });
  it('does not call an accepted sync result a confirmed cloud commit', async () => {
    expect(await requestOwnedNotesSync(owner, permission, async () => {})).toBe('requested');
  });
  it('fails closed when native Account owner changes during in-flight sync', async () => {
    let permissionNow = permission();
    const result = await requestOwnedNotesSync(owner, () => permissionNow, async () => {
      permissionNow = { ...permissionNow, ownerId: '22222222-2222-4222-8222-222222222222' };
    });
    expect(result).toBe('revoked-during-request');
  });
  it('fails closed on device grant revocation during native sync', async () => {
    let p = permission();
    const result = await requestOwnedNotesSync(owner, () => p, async () => {
      p = {...p, authorized:false};
    });
    expect(result).toBe('revoked-during-request');
  });
});
