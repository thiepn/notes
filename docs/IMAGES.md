# Images + Attachments

P14 turns the attachment records already introduced by the Notes v1 database and exercised by P13 Google Keep import into a complete user-facing image workflow.

No database migration is required. P14 continues to use the existing `attachments` table and keeps attachment bytes local to IndexedDB.

## Native image capture

Images can be attached to both text notes and checklist notes from:

- the image picker
- drag and drop
- clipboard paste
- the mobile camera input (`capture="environment"`)
- the collapsed quick-capture image action for a new text note

Supported native capture formats are:

- JPEG
- PNG
- GIF
- WebP
- AVIF

The camera control is surfaced for coarse-pointer / touch-style devices. On desktop, the normal image picker remains the primary control.

## Attachment-only notes

An image is allowed to be the only meaningful content of a note.

Before P14, an otherwise-empty capture could be treated as disposable and removed on close or recovery. P14 checks the attachment table before deleting an empty capture. If an attachment exists, the note is preserved.

This applies to both text-note capture and checklist capture, including recovery after a reload.

## Validation and processing

Native images are treated as untrusted local input rather than accepted solely from their filename.

P14:

- rejects zero-byte images
- rejects unsupported formats
- verifies that the browser can decode the image
- limits one selected native image to 25 MB before processing
- limits one note to 50 attachments
- limits total attachment bytes for one note to 250 MB
- checks browser storage availability before starting an add operation when `navigator.storage.estimate()` is available
- hashes the final stored bytes with SHA-256
- skips duplicate images with the same stored checksum within the same note

Static images are decoded and written back through a browser canvas before storage. That deliberately creates a fresh pixel-based image rather than retaining the original container metadata.

The longest static-image dimension is capped at 4096 pixels. Large camera images are downscaled proportionally before storage.

### Metadata privacy

For JPEG, PNG, WebP, and AVIF, Notes attempts to create a fresh browser-encoded copy. This removes container metadata such as EXIF/XMP from formats the browser can re-encode. If AVIF output encoding is unavailable, the sanitized image falls back to WebP, then PNG.

GIF is handled differently because a normal canvas re-encode would destroy animation. Notes preserves the original animation stream while removing GIF comment extensions and XMP application metadata.

Native SVG upload is intentionally not part of P14. An SVG imported by P13 remains available as a generic downloadable attachment but is not rendered inline as trusted image content.

## Card previews and thumbnails

Cards no longer hide attachments.

Attachment previews are loaded lazily with `IntersectionObserver` only when a card is near the viewport. For previewable images, Notes derives a small WebP card thumbnail with a maximum dimension of 720 pixels instead of rendering the stored full-resolution image directly in the masonry grid.

The first image is shown on the card. Additional image/file counts appear as compact badges.

If a note has attachments but no safely previewable raster image, the card shows an attachment count instead of an empty-note placeholder.

The existing masonry `ResizeObserver` recalculates card height after an asynchronous thumbnail appears, so image cards do not overlap neighboring cards.

## Editing attachments

Text-note and checklist editors use the same attachment panel.

Users can:

- add more images
- paste images from the clipboard
- drag images into the note
- use the mobile camera input
- open images in the viewer
- remove attachments with an explicit two-step confirmation
- download imported non-image attachments

Attachment changes do not write fake note-text revisions. P11 revision snapshots remain focused on note text/checklist/color state; attachment bytes stay attached to the current note across history restore operations.

## Image viewer

Previewable raster images open in a full-screen local lightbox.

The viewer supports:

- previous/next navigation for multi-image notes
- Left/Right arrow keys
- Escape to close
- explicit close button
- image download
- responsive sizing on desktop and mobile
- body-scroll locking while open

The full stored image is used in the viewer. Card thumbnails are only a display optimization and are not persisted as duplicate database records.

## Imported attachments

P13 can import images, drawings, audio, PDFs, and other Keep attachment bytes. P14 does not discard those formats simply because native creation is image-focused.

Previewable raster images use the image grid/viewer. Other imported attachments are shown as file rows with:

- filename
- MIME type
- byte size
- download action
- remove action when the note is editable

This means an imported Keep attachment is no longer invisible after migration.

## Storage model

P14 does not create a second media database or filesystem abstraction.

All attachments remain native `AttachmentRecord` rows in the existing database:

- `id`
- `noteId`
- `name`
- `mimeType`
- `size`
- `checksum`
- `data`
- `createdAt`

P12 full backup already exports and restores these rows. P13 already writes Keep attachments into the same table. P14 therefore adds interaction without fragmenting the storage architecture.

Storage management is intentionally local and bounded:

- per-file preprocessing limit: 25 MB
- per-note attachment count: 50
- per-note attachment storage ceiling: 250 MB
- browser quota preflight where supported
- per-note removal from the editor
- SHA-256 duplicate suppression

## Lifecycle behavior

Attachments follow their parent note naturally:

- archiving keeps attachments
- restoring keeps attachments
- trashing keeps attachments until permanent deletion
- duplicating a note duplicates its attachment records through the existing Notes repository behavior
- permanent note deletion removes attachment records
- P12 backup/restore preserves them
- P13 import produces the same records used by native image capture

Images cannot be added to a trashed note.

## P14 regression gate

Chromium end-to-end coverage verifies that:

- the quick image action can create an attachment-only note
- the attachment-only note survives close/recovery semantics
- stored native images receive SHA-256 checksums
- duplicate native images are skipped
- static image metadata is not retained in the stored browser-encoded copy
- card thumbnails appear after lazy loading
- the lightbox opens and closes correctly
- removing an attachment removes the database record
- checklist notes can capture and retain images
- imported non-image attachments are visible and downloadable
- mobile controls remain usable at the minimum supported 320 px viewport
- camera capture controls are surfaced for the mobile layout

## Phase boundary

P14 answers: “How do images and imported attachment bytes become first-class Notes content without compromising local privacy or performance?”

P15 — PWA + Offline Certification answers: “Can the complete app be installed and remain trustworthy when the network disappears?”
