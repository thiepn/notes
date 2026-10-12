/** Device-specific Core coordination consent. NOT a Notes cloud sync grant. */
export const NOTES_CORE_COORDINATION_KEY = 'thiepn.notes.core-coordination.v1';
type Consent = { schemaVersion: 1; ownerId: string; enabled: boolean };
export function readCoreConsentValue(raw: string | null, ownerId: string | null): boolean {
  if (!ownerId || !raw || raw.length > 1024) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return false;
    const c = value as Partial<Consent>;
    return c.schemaVersion === 1 && c.ownerId === ownerId && c.enabled === true;
  } catch { return false; }
}
const ownerKey = (ownerId: string) => NOTES_CORE_COORDINATION_KEY + ':' + ownerId;
export function hasNotesCoreConsent(ownerId: string | null): boolean {
  if (!ownerId) return false;
  try { return readCoreConsentValue(localStorage.getItem(ownerKey(ownerId)), ownerId); }
  catch { return false; }
}
export function changeNotesCoreConsent(ownerId: string | null, enabled: boolean): boolean {
  if (!ownerId) return false;
  try {
    localStorage.setItem(ownerKey(ownerId), JSON.stringify({
      schemaVersion: 1, ownerId, enabled,
    } satisfies Consent));
    return true;
  } catch { return false; }
}
