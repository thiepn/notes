/** Device-local owner-scoped preference; not a remote Account session revoke. */
export const NOTES_NATIVE_SYNC_PAUSE_KEY = 'thiepn.notes.native-pause.v1';
export function readNotesNativePause(ownerId: string | null): boolean {
  if (!ownerId) return false;
  try {
    const value = JSON.parse(window.localStorage.getItem(NOTES_NATIVE_SYNC_PAUSE_KEY) || 'null') as {
      ownerId?: string; paused?: boolean
    } | null;
    return value?.ownerId === ownerId && value.paused === true;
  } catch { return false; }
}
export function writeNotesNativePause(ownerId: string, paused: boolean): boolean {
  try {
    window.localStorage.setItem(NOTES_NATIVE_SYNC_PAUSE_KEY,
      JSON.stringify({ ownerId, paused }));
    return true;
  } catch { return false; }
}
/** Ignore any async response that began before pause, owner or grant change. */
export function originalNotesAuthorityCurrent(input: {
  epoch: number; currentEpoch: number; ownerId: string;
  currentOwnerId: string | null; paused: boolean; accessGranted: boolean;
}): boolean {
  return input.epoch === input.currentEpoch && !input.paused && input.accessGranted &&
    input.ownerId === input.currentOwnerId;
}
