# Google Keep Takeout Import

P13 adds non-destructive Google Keep migration to Notes. It is deliberately separate from P12 Backup + Recovery.

- **P12 restore** replaces the complete Notes library with a trusted Notes backup.
- **P13 import** adds Google Keep Takeout notes to the existing Notes library without clearing or replacing local data.

P13 originally required no database migration. Import identity remains stored in the `settings` table, while V2-1 extends the importer to write the database-v2 `reminders` table when a recognized absolute Keep reminder timestamp is available.

## Input

The importer accepts three local source workflows:

1. one or more Google Takeout ZIP files
2. an extracted Google Keep folder
3. individual extracted Keep files, including drag-and-drop

Multiple ZIP parts can be selected together. This matters for large Google Takeout exports where Keep JSON and attachment files may be split across more than one archive.

JSON is authoritative when both `.json` and `.html` representations of the same note exist. If a matching JSON note is unavailable, P13 can use the exported HTML as a best-effort, text-only fallback. Imported HTML is parsed as data and is never inserted or executed as arbitrary page markup.

Current browser safety boundaries are:

- maximum 512 MB total selected source size
- maximum 100 MB for one expanded archive entry or selected file
- maximum 768 MB expanded data per ZIP
- unsafe paths containing parent traversal are ignored
- large imports receive a browser-storage preflight warning when available space appears insufficient

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
- recognized absolute reminder timestamps

The parser is permissive about unknown extra JSON keys so future Takeout additions do not automatically make otherwise valid notes unreadable.

## Text, checklist, and HTML mapping

A Keep JSON record with `listContent` becomes a Notes checklist. A record without `listContent` becomes a text note.

Historical Takeout JSON commonly uses `isChecked` for checklist state and `mimetype` for attachment MIME metadata. The compatibility layer also accepts `checked`, `childListItems`, and `mimeType` aliases used by current Keep tooling/API-shaped exports, preventing checked state, nested rows, or MIME metadata from being lost when a Takeout has been normalized by another tool.

Checklist rows receive new local UUIDs. Parent relationships are remapped to those local IDs. Notes currently supports one level of checklist nesting. If a Takeout file contains deeper nesting, P13 keeps every row but flattens deeper descendants to the nearest supported root parent and surfaces a preview warning.

If a JSON note unexpectedly contains both text and checklist content, P13 uses the structurally richer checklist representation and reports a warning instead of creating two notes.

When only HTML is available, P13 extracts plain text, recognizable checklist rows, labels, and local attachment references where possible. Metadata that HTML cannot reliably preserve, such as color or lifecycle state, uses safe Notes defaults and is reported as a fallback limitation.

Import refuses a note that exceeds the existing Notes data limits instead of silently truncating user data:

- title: 500 characters
- text body: 1,000,000 characters
- checklist: 10,000 rows
- one checklist item: 100,000 characters

A rejected note does not prevent other valid notes in the selected source from being previewed and imported.

## Colors

Google Keep color names are mapped to the closest Notes color token.

| Google Keep values             | Notes color |
| ------------------------------ | ----------- |
| DEFAULT, WHITE, CHALK          | default     |
| RED, CORAL                     | red         |
| ORANGE, PEACH                  | orange      |
| YELLOW, SAND                   | yellow      |
| GREEN, MINT, SAGE              | green       |
| TEAL                           | teal        |
| BLUE, CERULEAN, DARK_BLUE, FOG | blue        |
| STORM, GRAY, GREY              | gray        |
| PURPLE, DUSK                   | purple      |
| PINK, BLOSSOM                  | pink        |
| BROWN, CLAY                    | brown       |

Unknown colors are preserved as an import warning and use the default Notes color rather than blocking the note.

## Lifecycle state

P13 preserves the strongest durable Keep lifecycle state while respecting Notes invariants:

1. A trashed Keep note becomes a trashed Notes note. Pin/archive state is cleared.
2. Otherwise an archived Keep note becomes archived. Pin state is cleared.
3. Otherwise a pinned Keep note remains active and pinned.
4. Otherwise the note is active and unpinned.

The Keep last-edited timestamp is used for the corresponding pin/archive/trash timestamp. Created and updated timestamps are converted from Takeout microseconds to Notes milliseconds.

Malformed or impossible source timestamps no longer discard an otherwise usable note. P13 falls back to the remaining valid source time or the import time and reports a warning.

## Reminders

V2-1 conservatively extends P13 reminder migration. If known reminder-like fields contain a recognized absolute timestamp, the note receives one active local reminder preserving that instant. Because Takeout may not preserve enough scheduling-zone context to reconstruct the original wall-clock timezone, imported reminder timestamps use `timeZone: "UTC"` rather than inventing a local zone.

If reminder-like metadata is present but no recognized timestamp can be extracted, the preview reports a warning and imports the note without a reminder. The importer never guesses a due time.

## Labels

Labels are merged by the same normalized identity used everywhere else in Notes: trimmed/collapsed whitespace, Unicode NFKC normalization, and case-insensitive comparison.

For example, an existing Notes label `Work` and an imported Keep label `work` resolve to one label. P13 never creates a duplicate normalized label just because its display casing or spacing differs.

Invalid or over-100-character Keep labels are skipped with a preview warning while the note itself remains importable.

After a successful import, the application refreshes its label state immediately so newly created Keep labels appear in the sidebar without requiring a reload or leaving the import result screen.

## Attachments

P13 stores attachment bytes in the existing `attachments` table and computes a lowercase SHA-256 checksum from the imported bytes.

Attachment lookup supports:

1. path relative to the note file
2. exact path inside the same selected source
3. a unique same-archive filename match
4. a unique filename match across all selected Takeout parts/files

A missing attachment produces a warning and does not discard the note. The preview also lets the user disable attachment import while still migrating note content.

P13 is responsible for correct attachment ingestion and preservation. P14 is responsible for the full image viewing/attachment interaction experience.

## Collaborators and annotations

The current Notes v1 scope has no collaboration/account model, so collaborator metadata is not converted into app state. A note containing collaborator metadata remains importable and the preview reports that the metadata will not be imported.

Takeout annotations are likewise not represented as a separate Notes database concept. Existing text/list content remains intact and P13 reports the unsupported annotation metadata in preview.

## Preview and import controls

Selecting a source is read-only. P13 extracts, parses, maps, hashes attachments, evaluates duplicate source identities, and builds a preview before the import button is enabled.

The preview reports:

- notes ready to import
- source notes already imported
- active, archived, trashed, and pinned counts
- text-note and checklist counts
- distinct labels
- attachment count and size
- HTML fallback count
- skipped notes and missing attachments
- warnings

The user can include or exclude active notes, archived notes, trashed notes, and attachments before committing. Scan/import progress is reported using real completed/total work rather than a synthetic percentage.

Warnings do not imply partial database writes because no database mutation has happened during preview.

## Repeat-import protection

Every successfully imported source note gets a stable source identity. P13 uses a Keep source ID when present. Otherwise it hashes a canonical representation of the source note, including its content and meaningful source metadata.

The successful import records a setting with the prefix:

`google-keep-import:v1:`

The setting stores the local note ID, source path, source update timestamp, and import timestamp.

Earlier P13 builds used a creation-timestamp-derived fallback identity. The current importer retains that value as a compatibility alias when checking an existing ledger, so users who already migrated with the earlier implementation do not receive a duplicate library after upgrading.

Within a new import, the stronger canonical fingerprint prevents distinct notes that happen to share the same creation timestamp from being collapsed into one source identity.

When an already imported source is selected again, it is shown as **Already imported** and is not imported a second time. P13 never overwrites a locally edited note from a later Takeout selection.

Because the ledger lives in the durable `settings` table, P12 full backups preserve repeat-import knowledge when the library moves to another browser installation.

## Commit safety

Import uses one Dexie read-write transaction spanning all eight durable tables:

- `notes`
- `checklistItems`
- `labels`
- `noteLabels`
- `attachments`
- `reminders`
- `revisions`
- `settings`

P13 rechecks source ledger identities inside that transaction to protect against a stale preview or another import completing between preview and commit.

For each new source note the transaction creates:

- one native Notes note
- checklist rows when needed
- missing normalized labels and note-label relationships
- attachments when enabled and available
- one active reminder when a recognized absolute reminder timestamp exists
- an initial P11 revision with reason `import`
- one repeat-import ledger setting

Existing local notes are never cleared or replaced.

If a later write fails, IndexedDB aborts the whole import transaction. New notes, new labels, relationships, attachments, revisions, and ledger rows from that transaction all roll back together.

## Initial revision baseline

Each imported note receives one P11 revision snapshot with reason `import`. This gives the migrated state an immediate recovery baseline before the user makes the first local edit.

## P13 regression gate

Automated coverage must prove that:

- direct Takeout ZIPs can be selected and previewed
- multiple Takeout ZIP parts work together
- extracted Keep folders/files can be imported without ZIP packaging
- JSON wins over matching HTML sidecars
- HTML-only notes use the safe fallback path
- an existing local note survives unchanged
- existing normalized labels are reused and new labels are created only once
- text content and checklist checked/parent state survive
- compatibility aliases preserve `checked`/`childListItems` nesting and `mimeType` metadata
- Keep color and lifecycle state map correctly
- valid timestamps survive conversion and invalid timestamps recover with warnings
- attachment bytes and SHA-256 survive import
- imported notes receive P11 `import` revisions
- source ledger rows are written
- stronger fingerprints distinguish notes that share a creation timestamp
- legacy ledger aliases still prevent duplicate upgrades
- selecting the same Takeout again produces no duplicate notes
- recognized reminder timestamps migrate conservatively and ambiguous reminder metadata warns without guessing
- malformed/unrecoverable Takeout input produces no writes
- a forced write failure rolls back every imported table mutation

## Phase boundary

P12 answers: “How do I restore or move a complete Notes library?”

P13 answers: “How do I migrate my Google Keep Takeout into my existing Notes library safely?”

P14 makes image attachments a complete first-class Notes interaction and viewing experience. V2-1 subsequently extends P13 with conservative reminder migration into the database-v2 reminder model.
