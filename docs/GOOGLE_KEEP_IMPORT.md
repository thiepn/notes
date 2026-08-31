# Google Keep Takeout Import

P13 adds non-destructive Google Keep migration to Notes. It is deliberately separate from P12 Backup + Recovery.

- **P12 restore** replaces the complete Notes library with a trusted Notes backup.
- **P13 import** adds Google Keep Takeout notes to the existing Notes library without clearing or replacing local data.

No database migration is required for P13. Import identity is stored in the existing `settings` table so P12 automatically backs it up and restores it with the rest of the library.

## Input

The importer accepts Google Takeout ZIP files directly. The user does not need to extract the archive first.

Multiple ZIP parts can be selected together. This matters for large Google Takeout exports where Keep JSON and attachment files may be split across more than one archive.

Current browser safety boundaries are:

- maximum 512 MB total selected compressed ZIP size
- maximum 100 MB for one expanded archive entry
- maximum 768 MB expanded data per ZIP
- HTML Keep sidecar files are ignored during extraction because the JSON files are authoritative
- unsafe ZIP paths containing parent traversal are ignored

The import runs entirely in the browser. No Takeout data is uploaded to a server.

## Supported Google Keep data

P13 maps the durable Keep fields that fit the Notes v1 model:

- title
- text content
- checklist rows and checked state
- checklist child relationships where present
- color
- labels
- pinned state
- archived state
- trashed state
- created timestamp
- last-edited timestamp
- attachment file path, MIME type, and bytes

The parser is permissive about unknown extra JSON keys so future Takeout additions do not automatically make otherwise valid notes unreadable.

## Text and checklist mapping

A Keep JSON record with `listContent` becomes a Notes checklist. A record without `listContent` becomes a text note.

Checklist rows receive new local UUIDs. Parent relationships are remapped to those local IDs. Notes currently supports one level of checklist nesting. If a Takeout file contains deeper nesting, P13 keeps every row but flattens deeper descendants to the nearest supported root parent and surfaces a preview warning.

Import refuses a note that exceeds the existing Notes data limits instead of silently truncating user data:

- title: 500 characters
- text body: 1,000,000 characters
- checklist: 10,000 rows
- one checklist item: 100,000 characters

A rejected note does not prevent other valid notes in the selected Takeout from being previewed and imported.

## Colors

Google Keep color names are mapped to the closest Notes color token.

| Google Keep values | Notes color |
| --- | --- |
| DEFAULT, WHITE, CHALK | default |
| RED, CORAL | red |
| ORANGE, PEACH | orange |
| YELLOW, SAND | yellow |
| GREEN, MINT, SAGE | green |
| TEAL | teal |
| BLUE, CERULEAN, DARK_BLUE, FOG | blue |
| STORM, GRAY, GREY | gray |
| PURPLE, DUSK | purple |
| PINK, BLOSSOM | pink |
| BROWN, CLAY | brown |

Unknown colors are preserved as an import warning and use the default Notes color rather than blocking the note.

## Lifecycle state

P13 preserves the strongest durable Keep lifecycle state while respecting Notes invariants:

1. A trashed Keep note becomes a trashed Notes note. Pin/archive state is cleared.
2. Otherwise an archived Keep note becomes archived. Pin state is cleared.
3. Otherwise a pinned Keep note remains active and pinned.
4. Otherwise the note is active and unpinned.

The Keep last-edited timestamp is used for the corresponding pin/archive/trash timestamp. Created and updated timestamps are converted from Takeout microseconds to Notes milliseconds.

## Labels

Labels are merged by the same normalized identity used everywhere else in Notes: trimmed/collapsed whitespace, Unicode NFKC normalization, and case-insensitive comparison.

For example, an existing Notes label `Work` and an imported Keep label ` work ` resolve to one label. P13 never creates a duplicate normalized label just because its display casing or spacing differs.

Invalid or over-100-character Keep labels are skipped with a preview warning while the note itself remains importable.

## Attachments

P13 stores attachment bytes in the existing `attachments` table and computes a lowercase SHA-256 checksum from the imported bytes.

Attachment lookup supports:

1. path relative to the note JSON file
2. exact path inside the same ZIP
3. a unique same-ZIP filename match
4. a unique filename match across all selected Takeout ZIP parts

A missing attachment produces a warning and does not discard the note. This is preferable to losing the note when a Takeout archive is incomplete.

P13 is responsible for correct attachment ingestion and preservation. P14 is responsible for the full image viewing/attachment interaction experience.

## Collaborators and annotations

The current Notes v1 scope has no collaboration/account model, so collaborator metadata is not converted into app state. A note containing collaborator metadata remains importable and the preview reports that the metadata will not be imported.

Takeout annotations are likewise not represented as a separate Notes database concept. Existing text/list content remains intact and P13 reports the unsupported annotation metadata in preview.

## Preview before write

Selecting Takeout ZIP files is read-only. P13 fully extracts, parses, maps, hashes attachments, evaluates duplicate source identities, and builds a preview before the import button is enabled.

The preview reports:

- notes ready to import
- source notes already imported
- text-note count
- checklist count
- distinct imported labels
- attachment count
- skipped notes
- missing attachments
- warnings

Warnings do not imply partial database writes because no database mutation has happened yet.

## Repeat-import protection

Every successfully imported source note gets a stable import source key. P13 prefers a future/available Keep source ID; otherwise it uses the note's Takeout creation timestamp, with a content/path hash fallback only when neither is available.

The successful import records a setting with the prefix:

`google-keep-import:v1:`

The setting stores the local note ID, source path, source update timestamp, and import timestamp.

When the same source is selected again, it is shown as **Already imported** and is not imported a second time. This is intentionally conservative: if the user has edited the local imported note since migration, a later Takeout selection must not overwrite or duplicate those local edits.

Because the ledger lives in the durable `settings` table, P12 full backups preserve repeat-import knowledge when the library moves to another browser installation.

## Atomic import

Import uses one Dexie read-write transaction spanning all seven durable tables:

- `notes`
- `checklistItems`
- `labels`
- `noteLabels`
- `attachments`
- `revisions`
- `settings`

P13 rechecks source ledger keys inside that transaction to protect against a stale preview or another import completing between preview and commit.

For each new source note the transaction creates:

- one Notes note
- checklist rows when needed
- missing normalized labels and note-label relationships
- attachments that were found and verified
- an initial P11 revision with reason `import`
- one repeat-import ledger setting

Existing local notes are never cleared or replaced.

If any later write fails, IndexedDB aborts the whole import transaction. New notes, new labels, relationships, attachments, revisions, and ledger rows from that transaction all roll back together.

## Initial revision baseline

Each imported note receives one P11 revision snapshot with reason `import`. This gives the migrated state an immediate recovery baseline before the user makes the first local edit.

## P13 regression gate

Real Chromium coverage must prove that:

- a direct Takeout ZIP can be selected and previewed
- multiple Takeout ZIP parts work together
- an existing local note survives unchanged
- existing normalized labels are reused
- new labels are created only once
- text content and checklist checked/parent state survive
- Keep color and lifecycle state map correctly
- source timestamps survive conversion
- attachment bytes and SHA-256 survive import
- imported notes receive P11 `import` revisions
- source ledger rows are written
- selecting the same Takeout again produces no duplicate notes
- malformed/unrecoverable Takeout input produces no writes
- a forced write failure rolls back every imported table mutation

## Phase boundary

P12 answers: “How do I restore or move a complete Notes library?”

P13 answers: “How do I migrate my Google Keep Takeout into my existing Notes library safely?”

P14 will make image attachments a complete first-class Notes interaction and viewing experience.
