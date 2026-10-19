# Notes B9 — source-owned Core request port

Pinned upstream main `1b3293a63b959cea43b4661b8fbf5fd510542b97`. This draft does not introduce any new transport or second timer. `SyncProvider` already owns a 15-second foreground interval, `syncNow()`, private workspace claiming and account changes. This branch only exposes the verified owner ID through its internal React context and a read-only/explicit-request hook `useNotesCoreSyncAdapter()` that delegates to existing syncNow. The hook returns 'requested' rather than fabricating a confirmed success; the original status remains authoritative.

No new raw Notes records are mapped to the Core Knowledge resource types; attachments, labels, checklists, reminders and revisions remain in native Notes. No new OAuth grants or production changes. This is a separate unmerged consumer candidate; actual end-to-end activation requires an explicit Notes-side UI consent mechanism and a matching Core versioned package before deployment.
