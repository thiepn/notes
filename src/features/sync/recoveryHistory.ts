/** In-memory Notes UI incident metadata, never a Notes database or Core sync collection. */
export type NotesIncidentKind =
  'inspected' | 'native-retry-requested' | 'native-backup-opened' | 'core-grant-revoked';
export interface NotesIncident {
  kind: NotesIncidentKind;
  observedAt: number;
  sequence: number;
}
export interface NotesIncidentHistory {
  ownerId: string | null;
  entries: NotesIncident[];
}
export function appendNotesRecoveryIncident(
  previous: NotesIncidentHistory,
  ownerId: string | null,
  kind: NotesIncidentKind,
  now: number,
): NotesIncidentHistory {
  if (!ownerId || !Number.isSafeInteger(now) || now < 0) return { ownerId: null, entries: [] };
  const owned = previous.ownerId === ownerId ? previous.entries : [];
  const sequence = (owned.at(-1)?.sequence ?? 0) + 1;
  return { ownerId, entries: [...owned, { kind, observedAt: now, sequence }].slice(-12) };
}
export function visibleNotesRecoveryIncidents(
  history: NotesIncidentHistory,
  ownerId: string | null,
) {
  return ownerId && ownerId === history.ownerId ? history.entries.map((x) => ({ ...x })) : [];
}
