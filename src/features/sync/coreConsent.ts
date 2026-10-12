/** Device-specific Core coordination consent. NOT a Notes cloud sync grant. */
export const NOTES_CORE_COORDINATION_KEY = 'thiepn.notes.core-coordination.v1';
type Consent = { schemaVersion: 1; ownerId: string; enabled: boolean; revision?: number };
export function readCoreConsentValue(raw: string | null, ownerId: string | null): boolean {
  if (!ownerId || !raw || raw.length > 1024) return false;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return false;
    const c = value as Partial<Consent>;
    return c.schemaVersion === 1 && c.ownerId === ownerId && c.enabled === true;
  } catch {
    return false;
  }
}
const ownerKey = (ownerId: string) => NOTES_CORE_COORDINATION_KEY + ':' + ownerId;
export function hasNotesCoreConsent(ownerId: string | null): boolean {
  if (!ownerId) return false;
  try {
    return readCoreConsentValue(localStorage.getItem(ownerKey(ownerId)), ownerId);
  } catch {
    return false;
  }
}
export function changeNotesCoreConsent(ownerId: string | null, enabled: boolean): boolean {
  if (!ownerId) return false;
  try {
    const current = (() => {
      try {
        const raw = localStorage.getItem(ownerKey(ownerId));
        const value = raw ? (JSON.parse(raw) as Partial<Consent>) : null;
        return value?.schemaVersion === 1 &&
          value.ownerId === ownerId &&
          Number.isSafeInteger(value.revision) &&
          (value.revision ?? 0) > 0
          ? value.revision!
          : value?.schemaVersion === 1 && value.ownerId === ownerId
            ? 1
            : 0;
      } catch {
        return 0;
      }
    })();
    if (current === Number.MAX_SAFE_INTEGER) return false;
    localStorage.setItem(
      ownerKey(ownerId),
      JSON.stringify({
        schemaVersion: 1,
        ownerId,
        enabled,
        revision: current + 1,
      } satisfies Consent),
    );
    return true;
  } catch {
    return false;
  }
}

/** Explicitly rotate the separate device consent before Account exit or deletion. */
export function revokeNotesCoreOnAccountExit(ownerId: string | null): boolean {
  if (!ownerId) return false;
  return changeNotesCoreConsent(ownerId, false);
}

/** A revision is bound to each request; toggling off then on invalidates the old grant. */
export function getNotesCoreRevision(ownerId: string | null): number | null {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(ownerKey(ownerId));
    if (!readCoreConsentValue(raw, ownerId) || !raw) return null;
    const parsed = JSON.parse(raw) as Consent;
    // Older B12 consent records were unversioned. They remain authorized with
    // revision 1 until the owner rotates the device permission.
    return parsed.revision === undefined
      ? 1
      : Number.isSafeInteger(parsed.revision) && parsed.revision > 0
        ? parsed.revision
        : null;
  } catch {
    return null;
  }
}
