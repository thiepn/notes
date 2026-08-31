# Colors + Labels

P6 adds Google Keep-style shallow organization without introducing folders or hierarchy. Notes can use one visual color and any number of labels, labels appear in the sidebar, and selecting a label opens a filtered active-note view.

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

## Card UI

Cards in Notes and Archive expose two new quick actions:

- color picker,
- label picker.

Assigned labels render as compact chips on cards. The label picker supports multiple checked labels. Trash cards display preserved label chips but expose no organization controls.

## Label manager

The sidebar Labels section opens a dedicated manager for create, rename, and delete operations. Label deletion uses an inline confirmation step because note-label relationships are removed even though note content remains safe.

## Tests

Vitest covers label normalization, whitespace collapse, case-insensitive matching, Unicode compatibility normalization, and empty-name rejection.

Playwright covers:

- label create/rename/delete,
- deletion preserving the underlying note,
- card label assignment,
- label chips,
- persisted label navigation,
- automatic label inheritance for notes created inside a label view,
- persistent note color changes,
- multi-label assignment,
- all previous P1-P5 regressions.

The implementation is certified through the same format, lint, strict TypeScript, production-build, and real-browser gates used by earlier phases before P6 is closed.

## Phase boundary

P6 owns shallow visual organization: colors, labels, label management, label assignment, and label-filtered browsing. P7 owns checklist capture and editing behavior.
