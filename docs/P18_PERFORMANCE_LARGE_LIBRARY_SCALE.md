# P18 — Performance & Large-Library Scale

## Goal

P18 hardens Notes for larger libraries without changing the local-first data model, sync format, or product hierarchy. The phase targets hidden IndexedDB I/O, attachment payload reads, and browser work that remained after V4 progressive card mounting.

## Audit findings

### 1. Progressive card mounting did not prevent relationship-table scans

`NotesWorkspace` already mounts cards progressively, but collection hydration called `LabelsRepository.labelIdsByNote()` and `ChecklistsRepository.itemsByNote()`. Both methods previously loaded their entire IndexedDB table with `toArray()` and filtered in JavaScript.

That made the cost proportional to the whole library even when the current collection was only Archive, Trash, or one label.

P18 changes both methods to use the existing `noteId` indexes with `anyOf(...)` and deduplicates requested note IDs first.

### 2. Attachment cards materialized Blob payloads just to show metadata

`NoteCardAttachmentPreview` previously called `AttachmentsRepository.list(noteId)`. That materialized every attachment record, including every Blob, even when the card only needed counts and MIME categories.

P18 adds a metadata-first card summary path using the existing `[noteId+mimeType]` compound index:

- file/image/audio counts come from index keys;
- non-image cards read zero Blob records;
- image cards load only one attachment record for the thumbnail Blob;
- existing lazy IntersectionObserver loading and thumbnail downscaling remain unchanged.

This is particularly important for notes containing large PDFs, audio recordings, or multiple images.

### 3. Existing render-window protections remain valid at higher note counts

The existing responsive progressive mounting architecture is retained. P18 adds a permanent 5,000-note mobile browser scenario to verify that the initial DOM remains bounded while the grid still reports the complete collection size.

## Regression contracts

P18 adds browser coverage that verifies:

- targeted label hydration still works when `noteLabels.toArray()` is forbidden;
- targeted checklist hydration still works when `checklistItems.toArray()` is forbidden;
- duplicate note IDs in a hydration request do not change results;
- a non-image attachment summary reads no Blob record;
- adding one image causes exactly one Blob-bearing attachment record to be fetched for the thumbnail;
- a 5,000-note mobile collection reports all notes while keeping the mounted card window bounded.

The existing permanent gates remain mandatory:

- 10,000-note fuzzy search budget;
- worker-based search scoring and incremental reindexing;
- 1,000-note progressive mount regression;
- attachment-search Blob-scan guard;
- production bundle/performance budget;
- cross-browser compatibility;
- full Chromium regression;
- PWA/offline certification.

## Preserved boundaries

P18 intentionally does not change:

- IndexedDB database version or record schemas;
- note/checklist/label/attachment persistence formats;
- Supabase schema, RLS, auth, or remote sync records;
- backup format;
- search ranking semantics;
- note sorting or bulk-action semantics;
- privacy behavior;
- service-worker/PWA transport contracts.
