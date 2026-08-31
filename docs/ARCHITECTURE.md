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

P12 owns complete durable-library backup and replacement recovery. A full backup contains all seven database-v1 tables: notes, checklist items, labels, note-label relationships, attachments, revisions, and settings.

Export reads all seven tables from one Dexie read transaction so the file represents a consistent database snapshot. The backup format is versioned, self-contained JSON; attachment bytes are stored as base64 and receive an independent SHA-256 integrity digest without replacing the attachment record's original checksum metadata.

Restore is deliberately replace-only. A selected file is parsed, schema-validated, graph-validated, and attachment-checksum-validated before any write transaction begins. The UI requires explicit acknowledgement and downloads a fresh current-device safety backup before destructive replacement.

The replacement itself is one seven-table IndexedDB transaction. Table clears and inserts commit together; any write error aborts the transaction and restores the previous local library. External collection merging and Google Keep Takeout semantics are deferred to P13 rather than weakening P12's deterministic disaster-recovery contract.
