# Architecture Decisions

## Hosting

The production application is a static PWA deployed from GitHub Pages and rooted at `/notes/`, targeting `https://thiepn.dev/notes/`.

## Runtime model

The application is local-first. IndexedDB is the source of truth for user data. Network access is never required for core note operations after the application shell is cached.

## Approved stack

- React 19
- TypeScript 6.0.x while current lint tooling lacks TypeScript 7 support
- Vite 8
- Dexie 4 over IndexedDB
- Zod for validation at import/storage boundaries
- fflate for local ZIP parsing of Google Takeout archives
- Lucide for icons
- Radix primitives only where accessible low-level overlays/menus are needed
- Vite PWA + Workbox for the service-worker layer
- Vitest for unit tests
- Playwright for end-to-end and regression tests
- ESLint + Prettier for code quality

## Deliberate omissions

P0 does not introduce Redux, a client router, a rich-text editor, a large UI framework, a backend SDK, or a cloud database. Dependencies are added when a concrete phase needs them.

## Path invariant

All production assets and navigation must function from `/notes/`. The project must not assume domain-root deployment.

## Reliability rule

From P1 onward, UI components must use a data-access layer rather than writing raw IndexedDB queries directly. Schema migrations and recovery behavior are treated as product features, not implementation details.

## Revision recovery boundary

P11 owns recovery inside a single note. Meaningful revisions are validated snapshots with bounded retention, transactional restore, reversible Undo, and text/checklist cross-type recovery. Current lifecycle state, labels, and attachments remain independent from a historical content restore.

## Whole-library disaster recovery boundary

P12 owns complete durable-library backup and replacement recovery. A full backup contains all eight current durable tables: notes, checklist items, labels, note-label relationships, attachments, reminders, revisions, and settings.

Export reads all seven tables from one Dexie read transaction so the file represents a consistent database snapshot. The backup format is versioned, self-contained JSON; attachment bytes are stored as base64 and receive an independent SHA-256 integrity digest without replacing the attachment record's original checksum metadata.

Restore is deliberately replace-only. A selected file is parsed, schema-validated, graph-validated, and attachment-checksum-validated before any write transaction begins. The UI requires explicit acknowledgement and downloads a fresh current-device safety backup before destructive replacement.

The replacement itself is one eight-table IndexedDB transaction. Table clears and inserts commit together; any write error aborts the transaction and restores the previous local library.

## External migration boundary

P13 owns additive migration from Google Keep Takeout. It does not reuse P12 restore semantics and never clears existing Notes data.

The browser accepts one or more Takeout ZIP files directly and uses fflate to inspect them locally. JSON note records are mapped into the existing Notes v1 model before the import button is enabled. Supported mappings include text/checklist content, check state and supported parent relationships, colors, labels, pin/archive/trash state, source timestamps, and attachment bytes. Unsupported collaborator or annotation metadata becomes a preview warning rather than corrupting the durable model.

Keep labels merge through the same normalized identity used by native Notes labels. Imported attachments receive a SHA-256 checksum from their actual bytes. Missing attachments or individually unsupported note records are surfaced before commit; valid notes remain recoverable instead of being silently truncated or discarded with the rest of the archive.

Every imported source note receives a stable source key recorded in the durable `settings` table under the `google-keep-import:v1:` namespace. The ledger is rechecked inside the write transaction, suppresses later duplicate imports, and is automatically preserved by P12 full-library backups. Re-import never overwrites an already imported local note, protecting local edits made after migration.

The migration itself is one read-write transaction spanning the durable tables it changes. New notes, checklist items, normalized labels, relationships, attachments, reminders when present, initial P11 `import` revisions, and source-ledger rows commit together. A later write failure aborts the entire transaction and leaves the pre-import local library unchanged.

P14 owns the complete image/attachment viewing and interaction experience; P13 only guarantees correct attachment ingestion and durable preservation during migration.

## Scale and storage hardening boundary

V3.9 treats browser-storage durability and large-library behavior as first-class reliability concerns.

Database version 3 keeps the attachment record format unchanged but adds `[noteId+name]` and `[noteId+mimeType]` compound indexes. Search reads those index keys instead of loading Blob-bearing attachment rows merely to discover filenames or image presence. Because the record shape is unchanged, V3.9 does not rewrite attachment bytes and existing backup payloads remain structurally compatible. Backup format v2 files created against database version 2 are normalized to database version 3 during validation.

The Settings → Data & advanced surface reports best-effort versus persistent browser storage and quota estimates when the Storage API is available. Persistence is requested only through an explicit user action. Persistent storage reduces automatic eviction risk but cannot protect against manual site-data clearing, so full backups remain the disaster-recovery boundary.

Grid/list view state is now coordinated by AppShell and passed explicitly to active workspaces. Global capture and search-focus requests are also represented as React state instead of locating rendered controls by accessible-name selectors. Focused-card keyboard commands remain DOM-aware because their target is intentionally the currently focused rendered card.

Custom global dialogs use a shared focus-containment hook for Tab cycling, Escape handling where appropriate, initial focus, and focus restoration. This keeps overlay accessibility behavior consistent without adding a UI-framework dependency.
