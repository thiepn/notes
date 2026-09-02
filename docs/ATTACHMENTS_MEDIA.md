# V3.6 Attachments & Media Interaction Polish

V3.6 improves how existing local attachments are understood and operated without changing attachment storage, import, capture, privacy processing, backup, lifecycle, or offline behavior.

## Scope

V3.6 adds derived presentation metadata to the established attachment experience:

- panel-level attachment count, total byte size, and mixed-media breakdown;
- image filenames, friendly type names, byte sizes, and direct download controls;
- lightbox filename, decoded pixel dimensions, friendly type, and byte size;
- audio duration when the browser exposes valid media metadata;
- friendly generic-file type labels such as `PDF document` instead of raw MIME strings;
- unchanged download and removal actions across image, audio, and imported generic attachments.

## Derived-only metadata

The new information is calculated from data that already exists or from the browser's media decoder:

- byte size comes from `AttachmentRecord.size`;
- type labels come from `AttachmentRecord.mimeType`;
- image dimensions come from `HTMLImageElement.naturalWidth` / `naturalHeight` after local decode;
- audio duration comes from the native audio element's metadata;
- collection totals and image/audio/file counts are calculated in memory from the current attachment list.

Width, height, duration, friendly labels, breakdowns, and totals are **not persisted** to IndexedDB.

## Persistence boundary

V3.6 requires no database migration and does not alter the attachment record schema. The existing attachment table remains authoritative for:

- Blob bytes;
- filename;
- MIME type;
- byte size;
- SHA-256 checksum;
- note ownership;
- creation time.

V3.6 does not re-encode, transcode, rename, reorder, or otherwise mutate existing attachment records merely to display richer metadata.

## Image behavior

Image tiles remain local Blob-backed previews and continue to open the existing full-screen lightbox. V3.6 adds a compact metadata caption beneath each image plus a direct download action.

The lightbox still supports Escape, Arrow Left/Right, previous/next controls, download, backdrop close, and body-scroll locking. The current image's decoded dimensions are reset when navigation changes to another attachment so dimensions from one image are never shown for another.

## Audio behavior

Voice recordings continue to use native `<audio controls>` with local object URLs. V3.6 listens only for browser media metadata and displays a formatted duration when it is finite and available. Failure to decode duration does not make the recording unusable; playback, download, and removal remain unchanged.

## Generic files

Imported non-image attachments continue to be visible and downloadable. V3.6 maps common MIME types to concise human labels while retaining generic fallbacks for unknown application, text, image, audio, and video MIME families.

## Privacy and offline behavior

No attachment content leaves the device. Metadata presentation is computed locally and works offline because it relies only on the already-cached application, IndexedDB Blob records, and browser decoders.

The phase does not weaken the existing static-image metadata stripping, attachment quota limits, duplicate suppression, backup integrity checks, or lifecycle cleanup.

## Deliberate exclusions

V3.6 does not add:

- cloud media hosting or streaming;
- server-side processing;
- media transcoding or compression controls;
- video editing;
- audio waveform editing;
- image annotation;
- attachment folders or ordering persistence;
- persistent width/height/duration columns;
- EXIF/location display;
- automatic OCR/transcription beyond the existing explicit OCR and Voice phases.
