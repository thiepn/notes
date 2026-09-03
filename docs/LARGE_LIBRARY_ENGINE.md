# V4.0 — Large-Library Engine & Responsiveness

## Release objective

V4.0 is the first major post-hardening release. It changes how Notes spends browser resources at library scale without changing the local-first product contract or adding cloud/account complexity.

## Off-main-thread search scoring

Search document scoring and fuzzy matching run in a dedicated module Worker. SearchWorkspace sends the normalized index to the worker once, then submits query/filter requests and receives only ordered note IDs plus scores.

If Worker construction is unavailable, the client retains a compatibility fallback using the same deterministic search engine. The production performance gate prevents SearchWorkspace from directly calling the synchronous scorer again.

## Incremental search refresh

SearchRepository now supports `loadDocument(noteId)`. Note edits, checklist changes, color/label changes, archive/pin/trash changes, duplicate operations, and attachment changes refresh only the affected search document instead of rescanning every note and relationship table.

The single-note path reads attachment metadata through the database-v3 compound metadata indexes, so it does not materialize attachment Blob payloads.

A full index rebuild remains available for initial search startup and global reminder-change reconciliation.

## Progressive note mounting

MasonryGrid no longer mounts an arbitrarily large collection in one React render. It starts with a bounded card window and expands in fixed batches near the scroll boundary. A keyboard-accessible **Show more notes** control remains available when automatic intersection loading is unavailable or when users reach it directly.

The total collection remains unchanged in memory and all bulk/data operations still operate on the full loaded collection. The optimization only bounds rendered cards, ResizeObservers, attachment preview observers, and initial DOM work.

## Release gates

V4.0 adds permanent browser coverage that verifies:

- a 1,000-note library does not mount all cards initially;
- the grid still knows the complete collection size;
- search instantiates the dedicated worker;
- an edited search result is reindexed without calling the full-library `loadIndex()` path.

Existing 10,000-note search-engine, bundle-size, Blob-scan, PWA, offline, data-integrity, and full browser regression gates remain mandatory.
