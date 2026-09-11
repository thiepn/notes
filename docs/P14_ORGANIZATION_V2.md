# P14 — Organization V2

P14 makes the organization tools that already exist in Notes easier to discover and use without adding folders, notebooks, hierarchical tags, or another metadata system.

## Product direction

The organization model remains deliberately small:

- **Notes** is the default capture workspace.
- **Pinned** answers “what matters now?”
- **Unlabeled** answers “what still needs organizing?”
- **Labels** remain the explicit user-authored grouping mechanism.
- **Smart views** are existing saved searches promoted into navigation.
- **Archive** removes finished material from the active workspace without making it undiscoverable.
- **Trash** remains the deletion/recovery lifecycle.

P14 does not introduce folders, nested notebooks, favorites as a duplicate of pinning, or a second saved-view persistence model.

## Organize shortcuts

The sidebar gains an **Organize** section with two derived local views:

### Pinned

Pinned opens the existing local search workspace with:

```text
is:pinned
```

The sidebar count is derived from active notes whose existing `pinnedAt` value is set. No new favorite or priority field is stored.

### Unlabeled

Unlabeled opens:

```text
is:active is:unlabeled
```

This intentionally excludes Archive and Trash. It provides an inbox-cleanup view for active notes that have no assigned labels.

The count is derived from the existing note-label relation and active-note lifecycle. No denormalized “unlabeled” flag is stored.

## Smart views

Saved searches from `search.saved.v1` now appear directly in the sidebar under **Smart views**.

- the five most recently saved views are shown directly;
- selecting a Smart View restores its complete saved query/filter snapshot through the existing saved-search navigation path;
- when more than five saved searches exist, the sidebar links back to Search rather than expanding into an oversized navigation list;
- adding or removing saved searches refreshes the section through the existing `searchHistoryChanged` app event.

P14 does not create a new Smart View table, schema version, sync object, or backup format. Smart Views are a navigation presentation of the saved-search system shipped previously.

## Search organization operators

P14 extends the existing deterministic local query language with:

- `is:unlabeled` — require zero assigned labels;
- `has:label` — require at least one assigned label.

These constraints use the label IDs already included in every local search document. The worker/index document format does not change.

The P13 search-assist surface also exposes these operators while typing `is:` or `has:`.

## Label management

The label manager keeps create, rename, search, and delete behavior and adds two cleanup tools:

- **Name A–Z / Most used** sorting;
- **Unused** filtering.

“Unused” is intentionally strict: a label is considered unused only when the existing `noteLabels` relation contains zero assignments anywhere in the library. A label used only by an archived or trashed note is therefore **not** presented as unused.

The note count shown inside label management is also library-wide. Sidebar label counts remain scoped to active notes because label navigation itself displays active labeled notes.

## Bulk organization

The existing multi-select toolbar already supports pinning, color changes, labels, archive/unarchive, trash/restore, export, and permanent deletion in lifecycle-safe collections.

P14 improves the bulk-label panel for larger label libraries:

- six or more labels expose a local label search field;
- filtering does not change the existing all/some/none membership states;
- applying a label continues through the existing `BulkActionsRepository` path and existing undo/revision behavior.

Mixed-lifecycle Search results intentionally remain browse/edit surfaces rather than gaining a new bulk-selection model in P14. This preserves the existing selection safety boundary documented in `SEARCH.md`.

## Architecture boundaries

P14 does **not** change:

- IndexedDB schema or version;
- `NoteRecord`, `LabelRecord`, or `NoteLabelRecord` formats;
- note lifecycle semantics;
- pin persistence semantics;
- search index document format;
- search-worker protocol;
- core free-text relevance/scoring;
- saved-search or recent-search persistence formats;
- repository revision/history behavior;
- Supabase/RLS or sync protocol;
- conflict handling;
- backup/import/export formats;
- privacy-lock behavior;
- PWA install/share/offline contracts.

All P14 organization counts and views are derived locally from authoritative existing data.

## Acceptance coverage

Focused unit coverage verifies:

- `is:unlabeled` parsing and matching;
- `has:label` parsing and matching;
- active-unlabeled views do not leak archived notes.

Dedicated browser coverage verifies:

- Pinned and Unlabeled sidebar counts and navigation;
- archived unlabeled notes are excluded from the active cleanup view;
- saved searches appear and reopen as Smart Views;
- archive-only label usage prevents a label from being marked unused;
- usage sorting reflects library-wide assignments;
- large label libraries can be filtered inside the bulk-label panel before applying membership.

The complete formatting, foundation, lint, TypeScript, unit, production-build, cross-browser, Chromium regression, and PWA/offline gates remain required before P14 can merge.
