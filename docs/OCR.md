# OCR

V2-6 / P26 adds private, local optical character recognition for image attachments while preserving Notes' local-first persistence model.

## Scope

OCR is available for previewable image attachments on text notes and checklists.

The feature supports three recognition languages in V2-6:

- English (`eng`)
- German (`deu`)
- French (`fra`)

The last selected recognition language is stored as a best-effort local browser preference.

## Local-only recognition

Recognition runs entirely in the browser through Tesseract.js.

Notes does not upload images or extracted text to an OCR API. The OCR worker, WebAssembly core, and trained-language files are packaged with the application and served from the same `/notes/` origin.

Tesseract.js is dynamically imported only when OCR is invoked, so ordinary note capture does not initialize the OCR engine.

## Offline packaging

The build prepares the OCR runtime into `public/ocr/`:

- `ocr/worker.min.js`
- `ocr/core/` — Tesseract WebAssembly/runtime variants
- `ocr/lang/eng.traineddata.gz`
- `ocr/lang/deu.traineddata.gz`
- `ocr/lang/fra.traineddata.gz`

The PWA service worker precaches JavaScript, WebAssembly, and compressed trained-data assets required by OCR. Once the current application version is installed/cached, recognition does not require a network connection.

Adding OCR therefore increases the PWA's cached application footprint. This is an intentional privacy/offline tradeoff: the language packs live locally instead of being fetched from a third-party CDN on demand.

## Persistence model

V2-6 requires **no database migration** and adds no OCR table, OCR cache, or attachment metadata field.

Recognition output is transient until the user explicitly acts on it.

The user can:

- review and edit the extracted text,
- copy it to the clipboard,
- run recognition again,
- change recognition language and rerun,
- add reviewed output to a text note.

Closing or cancelling OCR without copying/appending leaves the note and database unchanged.

## Text-note integration

For text notes, **Add to note** appends reviewed OCR output to the current body as ordinary Markdown-compatible source:

```text
## Extracted text

<reviewed OCR output>
```

If the note already contains text, the extraction section is separated by two newlines.

Because the result becomes normal `NoteRecord.content`, it automatically participates in the existing:

- autosave and crash recovery,
- revision history,
- search and indexing,
- WikiLink/rich-text source behavior,
- backup and restore,
- Markdown/JSON export,
- offline persistence.

OCR does not create a second source of truth.

## Checklist integration

Checklist OCR is deliberately **copy-only** in V2-6.

Recognition does not automatically create checklist items because OCR text does not contain reliable structural information about item boundaries, hierarchy, or check state. Users can copy reviewed output and decide how to structure it themselves.

## Recognition flow

Opening OCR immediately starts recognition using the remembered language.

The dialog exposes:

- source-image preview,
- recognition language,
- local-engine loading/recognition progress,
- cancellation,
- confidence when provided by the engine,
- editable extracted text,
- Run again,
- Copy text,
- Add to note for text notes.

Changing language starts a fresh recognition pass.

## Cancellation and lifecycle

Each recognition operation owns an `AbortController` and one Tesseract worker.

Cancelling or closing OCR terminates the active worker. Completed workers are also terminated after recognition so OCR memory is not retained unnecessarily between operations.

The nested OCR dialog owns keyboard focus while open. Escape closes OCR rather than the parent note/checklist editor.

## Text normalization

Before recognition text is appended, Notes normalizes it conservatively:

- CRLF/CR line endings become LF,
- trailing spaces and tabs on lines are removed,
- runs of three or more newlines collapse to two,
- outer whitespace is trimmed.

Notes does not attempt AI-based spelling, grammar, semantic, or formatting correction. The editable review step remains authoritative.

## Privacy

V2-6 does not send the image, recognition result, confidence data, or language choice to a remote service.

The original attachment continues to follow the established P14 attachment privacy/storage model. OCR reads the already-stored local attachment Blob.

## Performance

OCR is intentionally user-triggered rather than automatic.

The engine and language data are substantially heavier than ordinary note functionality, so V2-6 avoids:

- OCR on every attachment import,
- automatic background scanning,
- full-library OCR indexing,
- persistent recognition caches.

This keeps ordinary capture responsive and prevents background CPU/memory use.

## Phase boundary

V2-6 deliberately excludes:

- cloud OCR services,
- PDF OCR,
- handwriting recognition,
- automatic OCR during image import/camera capture,
- bulk or background OCR,
- document-layout reconstruction,
- bounding-box overlays or searchable image-coordinate maps,
- table/form reconstruction,
- AI correction, summarization, translation, or classification of OCR output,
- persisted OCR indexes separate from normal note content.

## Regression requirements

A V2-6 release must prove that:

- local OCR dependencies install reproducibly,
- the build can prepare the local worker, WebAssembly core, and all three language packs,
- OCR helper normalization and append semantics are unit-tested,
- a real browser recognition pass can extract text from an attached generated image,
- reviewed OCR output can be edited before persistence,
- Add to note updates ordinary text-note content through the existing editor/autosave flow,
- the persisted note contains the reviewed extraction after closing the editor,
- checklists expose OCR without automatic structural mutation,
- the OCR modal does not close its parent editor on Escape,
- the full pre-existing browser regression suite remains green,
- the worker, required WebAssembly core, and English/German/French trained data remain fetchable after the production browser is taken offline,
- production PWA/offline certification remains green.
