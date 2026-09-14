# P26 — Organization Interaction Refinement

## Goal

P26 tightens the existing organization workflows after P14 and P19 without introducing another organization model or changing persisted note/label data.

The phase focuses on keyboard continuity and large-label-library usability across the existing label manager, per-note label picker, and bulk color interaction.

## Label-manager interaction

The label manager keeps its existing create, rename, delete, sort, unused-filter, and search behavior while making nested actions deterministic for keyboard users.

- Creating a label returns focus to **New label name**, so consecutive label creation does not leave focus on a newly disabled submit button.
- Entering rename still focuses the rename field.
- Escape during rename cancels only the rename operation and returns focus to that row's Rename control instead of closing the entire label manager.
- Saving a rename returns focus to the renamed row's Rename control.
- Opening inline delete confirmation moves focus to the safe **Cancel** action.
- Escape or Cancel dismisses only that inline confirmation and restores focus to the row's Delete control.
- Completing a deletion moves focus to the stable **New label name** field because the deleted row no longer exists.
- The dialog exposes `aria-busy` while a label mutation is in progress.
- Escape closes the overall label-manager dialog only when no nested rename/delete interaction is active.

The existing modal focus trap continues to own focus containment and restoration to the original **Edit labels** opener when the full dialog closes.

## Per-note label filtering

P14 added label filtering to the bulk-label panel for larger libraries. P26 applies the same usability threshold to the existing per-note label picker:

- six or more labels expose a local **Find labels** search field;
- opening the label picker focuses that search field first;
- filtering changes presentation only and does not alter selected label IDs;
- zero matches display the existing organization-empty treatment;
- Escape continues to close the popover and restore focus to the action that opened it.

This remains an in-memory presentation filter. It does not add search-index fields, persistence, or a new label relation.

## Bulk color focus continuity

Applying a bulk color already leaves selection active. P26 now also returns focus to **Change color for selected notes** after the color popover closes, matching the focus-continuity contract already used by per-note color changes and Escape dismissal.

The underlying bulk transaction, undo snapshot, selected-note set, and note revisions are unchanged.

## Permanent regression coverage

`e2e/p26-organization-interaction-refinement.spec.ts` verifies:

- create/rename/delete focus continuity in the label manager;
- layered Escape handling for rename and delete confirmation;
- safe initial focus for inline label deletion;
- focus restoration to the label-manager opener after the full dialog closes;
- large per-note label-library filtering and popover focus ownership;
- bulk color application focus restoration while selection remains active.

Run the focused suite with:

```text
npm run e2e:p26
```

The complete release regression suite remains authoritative before merge.

## Preserved boundaries

P26 does **not** change:

- IndexedDB schema/version;
- `NoteRecord`, `LabelRecord`, or note-label relation formats;
- label create/rename/delete repository semantics;
- bulk transaction or undo semantics;
- lifecycle behavior for Notes, Archive, or Trash;
- pin or color persistence;
- search ranking, tokenization, operators, worker protocol, or saved-search formats;
- reminders;
- sync, conflict, recovery, or operations metadata;
- backup/import/export formats;
- privacy behavior;
- service-worker/PWA architecture.

P26 is an interaction-quality phase over existing authoritative data and existing mutation paths.
