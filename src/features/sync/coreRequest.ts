import type { NotesCorePermission } from './coreAdapter';

export type CoreRequestOutcome =
  | 'requested'
  | 'denied'
  | 'busy'
  | 'revoked-during-request';

/** Verifies Notes' actual account owner AND device coordination grant on both sides of async work. */
export async function requestOwnedNotesSync(
  expectedOwner: string,
  readPermission: () => NotesCorePermission,
  request: () => Promise<void>,
): Promise<Exclude<CoreRequestOutcome, 'busy'>> {
  const before = readPermission();
  if (!expectedOwner || before.ownerId !== expectedOwner || !before.authorized ||
    ['local', 'setup', 'recovery', 'offline', 'connecting'].includes(before.state))
    return 'denied';
  await request();
  const after = readPermission();
  if (after.ownerId !== before.ownerId || !after.authorized ||
    ['local', 'setup', 'recovery', 'offline', 'connecting'].includes(after.state))
    return 'revoked-during-request';
  // Native Notes reports its authoritative status separately; never fabricate "synced".
  return 'requested';
}
