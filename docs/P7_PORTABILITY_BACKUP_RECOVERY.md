# P7 — Portability, Backup & Recovery Hardening

P7 strengthens the portability layer that follows P6 sync safety. Notes already had an exact JSON disaster-recovery backup and a selection-based Markdown ZIP export. The missing product boundary was a complete, human-readable export of the entire library that remains useful outside Notes without weakening the exact-restore backup.

## Product goal

Notes must provide two different forms of data ownership:

1. **Exact recovery** — the existing versioned Notes JSON backup preserves every durable database record and is the supported restore format.
2. **Human-readable portability** — P7 exports the complete content library as ordinary Markdown and original attachment files, with an inspectable manifest describing metadata and relationships.

Neither format replaces the other.

## Portable library archive

The Backup workspace now exposes **Download portable archive**.

The operation first creates the same validated, transactionally consistent full-library snapshot used by the JSON backup. P7 then derives a ZIP without rereading a moving database state.

The archive contains:

- `README.md`
- `manifest.json`
- one Markdown file per note under `notes/`
- original attachment bytes under `attachments/<note-id>/`

Every active, archived, and trashed note is included. The export is library-wide rather than selection-based.

## Markdown documents

Each note Markdown file contains YAML-compatible front matter with:

- stable Notes note ID
- note type
- active / archived / trashed lifecycle state
- note color
- creation and modification timestamps
- pin/archive/trash timestamps
- labels
- reminder due time, time zone, and status when present

The body remains ordinary Markdown:

- text notes retain their text content and heading;
- checklist notes retain checked state, order, and supported nesting;
- attachments are listed as relative Markdown links to the corresponding exported files.

Wiki-style `[[links]]` remain plain text and therefore remain visible/portable even when the receiving application does not implement Notes link semantics.

## Attachment fidelity

P7 does not transcode, resize, rename internally, or otherwise alter attachment bytes.

Before the archive is built, the existing backup validator verifies attachment byte length and the backup SHA-256. The portable manifest then records:

- attachment ID
- portable path
- display/original name when available
- MIME type
- byte size
- SHA-256 digest

The exported file contains the same validated bytes.

Unsafe filesystem characters are sanitized only in the ZIP path. The manifest retains the original display name separately.

## Manifest

`manifest.json` uses:

- format: `thiepn.notes.portable`
- format version: `1`

It records source backup/database versions, archive counts, and one entry per note with its Markdown path, lifecycle metadata, labels, reminder summary, and attachment entries.

The manifest is deliberately JSON so migration tools can consume the archive without parsing Markdown front matter.

## Filename safety

Portable note names are derived from titles but include the first eight characters of the stable note ID. This keeps human-readable names while preventing title collisions.

Windows-reserved names, control characters, path separators, trailing periods/spaces, and oversized path segments are normalized before ZIP creation. Attachments without names receive a stable `attachment-<id>` filename and a known extension when the MIME type has a safe mapping.

## Exact backup remains authoritative for restore

The portable ZIP is **not** a replacement-restore format.

Internal revision history and database settings are intentionally not duplicated into the human-readable archive. They remain available in the exact JSON backup. P7 therefore does not introduce a second restore engine whose behavior could diverge from the established atomic restore path.

## Existing recovery guarantees retained

P7 does not change:

- backup format/version 2
- database schema/version 3
- full backup graph validation
- independent attachment SHA-256 verification
- 512 MB selected-backup validation boundary
- legacy backup compatibility
- pre-restore safety backup
- atomic all-table replace restore
- rollback on write failure
- Google Keep merge/import semantics
- per-note revision history
- P6 optional Supabase synchronization and conflict copies

## Deliberate exclusions

P7 does not add:

- scheduled/background backups
- cloud backup destinations
- automatic export
- incremental/differential backup files
- a backup-history database
- portable-ZIP import/restore
- Markdown round-trip claims
- encrypted archives or end-to-end encryption claims
- changes to Supabase schema, RLS, or account ownership

A future import capability may consume the portable format, but exact Notes disaster recovery remains intentionally tied to the validated JSON backup unless a separately versioned migration contract is introduced.

## Release invariants

P7 is releasable only if:

1. Portable export is built from a validated consistent full-library snapshot.
2. Active, archived, and trashed notes are all represented.
3. Text content and checklist checked/order/nesting state survive the export.
4. Labels and reminder metadata are represented in both note metadata and/or the manifest.
5. Original attachment bytes survive exactly and the manifest exposes their SHA-256 digest.
6. Portable note/attachment paths are filesystem-safe and title collisions cannot overwrite another note.
7. The archive includes an inspectable manifest and README.
8. The existing exact JSON backup/restore behavior is unchanged.
9. No IndexedDB or backend schema migration is introduced.
10. Full formatting, foundation, lint, typecheck, unit, Chromium E2E, build/performance, and PWA/offline gates remain green.
