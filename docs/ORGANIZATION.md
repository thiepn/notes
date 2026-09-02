# Colors + Labels

P6 adds Google Keep-style shallow organization without introducing folders or hierarchy. Notes can use one visual color and any number of labels, labels appear in the sidebar, and selecting a label opens a filtered active-note view.

V3.3 later polishes this same organization model with derived navigation counts, faster label finding, direct command-palette label navigation, and clearer workspace context. It does not introduce a second organization model or persistence layer.

## Color contract

The note color remains a field on the note record and uses the P2 semantic color tokens.

Supported values:

`default`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `brown`, `gray`.

Colors can be changed from Notes and Archive. Trash stays read-only. Color changes use the normal optimistic note revision and offer Undo through the existing toast system.

## Label model

P6 uses the existing database-v1 tables:

- `labels`
- `noteLabels`

No database migration is required. P6 keeps database schema version 1 unchanged.

A label has a user-facing `name` and a unique `nameNormalized` key. Names are trimmed, repeated whitespace is collapsed, Unicode compatibility forms are normalized with NFKC, and comparisons are case-insensitive. This prevents labels such as `Study`, `study`, and `STUDY` from becoming separate labels.

A note can have any number of labels through the compound `[noteId+labelId]` relationship table.

## Label lifecycle

Users can:

- create labels,
- rename labels,
- delete labels,
- assign multiple labels to a note,
- remove labels from a note,
- navigate directly to a label from the sidebar.

Deleting a label removes only the label and its `noteLabels` relationships. It never deletes, archives, trashes, or otherwise changes the linked notes.

## Label views

Selecting a sidebar label shows active notes carrying that label. Pinned notes remain pinned inside the filtered view.

The selected label ID is persisted under `notes.active-label`, so a label view survives reload. If the referenced label no longer exists, asynchronous label hydration clears that stale selection and the application falls back to the normal Notes view.

Creating a note while inside a label view automatically assigns that label before the capture is considered successfully saved. The assignment is idempotent and participates in P3 recovery: if a capture reloads inside the autosave window, the label is ensured again before the recovered note is surfaced.

## V3.3 organization and navigation polish

V3.3 makes existing collections easier to understand and reach without changing their semantics.

### Derived navigation counts

The sidebar shows live counts for:

- active Notes,
- active visible Reminders,
- Archive,
- Trash,
- each label's active-note membership.

The active Notes, Reminders, Archive, Trash, or label workspace also shows a compact count beside its heading.

These values are **derived UI state**. `NotesRepository`, `LabelsRepository`, and `RemindersRepository` remain authoritative. V3.3 creates no count table, cache table, search index, or migration. Label counts deliberately count only active notes because sidebar label destinations are active-note views.

Counts refresh after the normal workspace mutation paths, including capture/save, archive/unarchive, Trash/restore, label assignment changes, bulk operations that reload the collection, library restore/import refresh, label lifecycle changes, and reminder-change events. A count-refresh failure never blocks note access because counts are non-authoritative convenience state.

### Faster label finding

When at least six labels exist, the expanded sidebar exposes a local **Find labels** field. Filtering is case-insensitive and affects only the visible label navigation list. It does not change note search, label persistence, assignments, or the selected label.

Selecting a filtered label clears the temporary filter query so returning to the sidebar does not leave navigation unexpectedly narrowed. Compact-sidebar mode keeps its icon-first behavior and does not render the label-search field or numeric badges.

### Command-palette label destinations

Every current label becomes a derived command-palette entry:

- label: `Open label: <name>`
- group: `Labels`
- description: current active-note count

Running one reuses the existing label-navigation path and persisted `notes.active-label` state. Command entries are generated from the current label list and navigation stats; nothing about them is persisted separately.

## Card UI

Cards in Notes and Archive expose two quick organization actions:

- color picker,
- label picker.

Assigned labels render as compact chips on cards. The label picker supports multiple checked labels. Trash cards display preserved label chips but expose no organization controls.

## Label manager

The sidebar Labels section opens a dedicated manager for create, rename, and delete operations. Label deletion uses an inline confirmation step because note-label relationships are removed even though note content remains safe.

## Tests

Vitest covers label normalization, whitespace collapse, case-insensitive matching, Unicode compatibility normalization, empty-name rejection, and V3.3 derived label-count aggregation.

Playwright covers:

- label create/rename/delete,
- deletion preserving the underlying note,
- card label assignment,
- label chips,
- persisted label navigation,
- automatic label inheritance for notes created inside a label view,
- persistent note color changes,
- multi-label assignment,
- live Notes/Reminders/Archive/Trash/label navigation counts,
- large-label-list filtering,
- label workspace heading counts,
- command-palette label navigation with count context,
- count refresh after lifecycle mutation,
- all previous regressions.

The implementation is certified through the same format, lint, strict TypeScript, production-build, real-browser, and PWA/offline gates used by earlier phases before V3.3 is closed.

## Phase boundary

P6 owns shallow visual organization: colors, labels, label management, label assignment, and label-filtered browsing.

V3.3 owns only the navigation/readability polish around that existing model: derived counts, label filtering, count-aware headings, and command-palette label destinations. It does not add folders, hierarchy, smart collections, databases, or a new persistence authority.
