# P3 — Search, Labels, Archive & Trash Model

P3 consolidates the existing retrieval and lifecycle capabilities into one explicit organization model. It does **not** add folders, nested notebooks, a second durable search index, automatic Trash expiration, or a database migration.

## Product rule

Capture remains primary. Organization is optional and shallow; retrieval must continue to work even when a note has no labels. Search, labels, Archive, and Trash are views over the same local note library rather than independent stores.

## Collection contract

The organization layer recognizes four note collections:

- **Notes** — active notes (`archivedAt === null`, `trashedAt === null`).
- **Label** — an active-notes projection filtered by one label ID.
- **Archive** — archived notes (`archivedAt !== null`, `trashedAt === null`).
- **Trash** — trashed notes (`trashedAt !== null`). Trash takes lifecycle precedence if malformed legacy data contains both timestamps.

`src/features/organization/collectionModel.ts` owns lifecycle classification and shell-to-collection resolution. `AppShell` resolves the current organization destination once and passes its mode/label projection to the note workspace.

## Search contract

Global search continues to include Notes + Archive and exclude Trash. Existing worker-backed fuzzy scoring, field weighting, advanced operators, filters, saved searches, recent searches, OCR text and attachment metadata remain intact.

P3 adds consistency requirements:

- Search lifecycle mutations refresh shell collection counts immediately.
- Search label mutations refresh active label counts immediately.
- Renaming/deleting labels refreshes an already-open search index instead of retaining stale label names/IDs.
- Current, saved, and recent search filters automatically discard references to labels that no longer exist.
- A saved/recent search that becomes empty only because its sole deleted-label filter vanished is discarded instead of becoming an accidental match-all search.

The search index remains derived in memory and reconstructible from IndexedDB.

## Label contract

Labels remain many-to-many, flat, normalized and case-insensitive. Deleting a label deletes only label links; it never deletes or changes note lifecycle/content.

Global capture from an active label collection preserves that collection context. This applies to sidebar capture, mobile New, the `C` keyboard shortcut, and other shell-level capture entry points—not only to the inline composer already rendered inside the label view.

The label manager shows active-note usage counts and supports filtering larger label catalogs. Counts intentionally describe active Notes because label workspaces project active Notes only.

## Archive contract

Archive remains a reversible lifecycle state. Archiving clears pin state. Unarchive returns a note to Notes. Moving an archived note to Trash clears its archive timestamp; the short-lived Undo action can restore the pre-trash state while the toast remains available.

## Trash contract

Trash is non-editable until restoration. Individual restore/permanent-delete and multi-selection behavior remain unchanged.

P3 adds collection-level actions:

- **Restore all** restores every note currently in Trash to Notes and offers Undo.
- **Empty trash** requires an explicit destructive confirmation and then permanently deletes every current Trash note and its dependent checklist items, labels, attachments, reminders and revisions through the existing bulk repository transaction.

There is no automatic retention timer.

## Persistence and synchronization

P3 introduces no database migration. IndexedDB remains version 3 with the existing eight durable tables. Organization state is derived from existing note lifecycle timestamps, label/link rows, search settings and device-local recent-search history. Supabase synchronization therefore requires no new entity type or backend schema.

## Release invariants

P3 is releasable only if:

1. Existing P1/P2 data-preservation and responsive-shell contracts remain green.
2. Search continues to exclude Trash and preserve active/archived relevance behavior.
3. Label deletion cannot leave current/saved/recent searches silently constrained by a missing label.
4. Search mutations and normal note-workspace mutations expose the same navigation counts.
5. Global capture preserves an active label destination.
6. Empty Trash always requires confirmation and deletes only already-trashed notes.
7. Formatting, architecture checks, lint, TypeScript, unit tests, production performance gates, full Chromium regressions and PWA/offline certification pass on the exact merge candidate.
