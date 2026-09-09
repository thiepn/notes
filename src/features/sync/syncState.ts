export interface ShadowEntry {
  localHash: string | null;
  remoteHash: string | null;
}
export type SyncShadow = Record<string, ShadowEntry>;

/** Never acknowledge divergent snapshots: an edit made during a request still needs syncing. */
export function acknowledgedShadow(
  observed: SyncShadow,
  previous: SyncShadow,
  blocked: ReadonlySet<string>,
): SyncShadow {
  const next: SyncShadow = {};
  for (const [key, entry] of Object.entries(observed)) {
    const agrees =
      entry.localHash === entry.remoteHash ||
      (entry.localHash === null && entry.remoteHash?.startsWith('deleted:'));
    if (!blocked.has(key) && agrees) next[key] = entry;
    else if (previous[key]) next[key] = previous[key]!;
  }
  for (const key of blocked) if (previous[key]) next[key] = previous[key]!;
  return next;
}
