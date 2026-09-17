# Notes v1.1 Phase 4 — Rich Share-to-Notes Capture

## Status

Implemented on `v1.1-trust-capture`. Phase 4 extends the existing installed-PWA Web Share Target without changing Notes' local-first or privacy-lock model.

## Core invariant

> A share is either rejected before durable capture or committed exactly once as one local note plus all accepted attachments. A retry or replay of the same share token must never create a second copy.

## Share-target contract

The installed PWA still accepts `title`, `text`, and `url`, and now also advertises a bounded `files` field for supported attachment types:

- JPEG, PNG, GIF, WebP, AVIF;
- supported voice/audio formats already handled by Notes;
- PDF;
- Word, Excel, and PowerPoint legacy/OpenXML files;
- plain text, Markdown, CSV, and JSON.

Executable/unknown file types are not accepted.

The service worker rejects the entire incoming handoff if any supplied file is unsupported, empty, invalid-sized, the share exceeds the file-count limit, or the staged bytes exceed the handoff limit. It does not silently turn a partially accepted share into a note.

## Private staging

Shared bytes never enter query parameters or the URL fragment.

The service worker:

1. receives the multipart POST at `/notes/share-target`;
2. validates the bounded handoff;
3. stores sanitized metadata and the original `File` objects in device-local Cache Storage under `notes-share-target-v2`;
4. redirects to `/notes/#share=<opaque UUID>`.

Only the opaque UUID is visible in navigation state.

Staging limits:

- at most 20 files in one share;
- at most 100 MB of raw staged file bytes;
- at most 8 pending v2 handoffs;
- pending entries older than 24 hours are discarded when encountered/pruned.

`Cache-Control: no-store`, a stage-version header, and a staged-at header are recorded on the cached response. These headers are validation metadata for the local handoff; the cache remains a one-time device-local staging area rather than user library storage.

## Rollout compatibility

The current client reads `notes-share-target-v2` first and falls back to the original `notes-share-target-v1` JSON cache. Existing text/title/URL shares staged by the v1.0.1 service worker therefore remain consumable during the rollout.

There is no bulk rewrite of old staged payloads.

## Local validation and attachment preparation

The app validates the staged payload again before durable persistence.

### Images

Shared images reuse `prepareImageAttachment`, the same privacy-safe pipeline used by ordinary image capture. This preserves the existing behavior for:

- supported image-format checks;
- decode validation;
- dimension bounds;
- metadata-removing re-encoding where applicable;
- GIF privacy-metadata stripping;
- SHA-256 attachment checksums;
- native image size limits.

### Other supported files

Supported non-image files are stored as local attachments with:

- a sanitized filename;
- normalized/inferred supported MIME type;
- bounded file size;
- SHA-256 checksum;
- original file bytes.

Audio shares remain constrained by the existing Notes audio size limit. Generic supported files are capped at 50 MB per file. The existing note-wide limits of 50 attachments and 250 MB total attachment bytes remain authoritative.

Duplicate files inside one handoff are deduplicated by prepared content checksum.

No OCR, transcription, URL fetching, cloud processing, or automatic analysis runs merely because content was shared.

## Exact-once durable capture

Phase 4 adds a device-local exact-once ledger under:

```text
internal.share-capture.v1:<share-token>
```

The ledger is explicitly excluded from portable settings/backup data.

A single IndexedDB transaction writes:

1. the new text note;
2. every prepared attachment;
3. the consumption ledger entry that points at the created note.

If that transaction fails, none of those three durable effects is committed and the staged share/token is left available for retry.

If the transaction commits but cache cleanup, navigation, or the page later fails, replaying the same token reads the ledger and resolves to the already-created note. It does not create another note or another set of attachments.

If a consumed note is later deleted, the token remains consumed; replay does not resurrect the deleted note.

## Privacy lock

`LaunchIntentCoordinator` remains below `PrivacyGate` in the application tree.

When Notes is locked:

- the staged share remains in Cache Storage;
- no note or attachment is persisted from the share;
- the lock screen receives no shared title, text, URL, or filename;
- consumption begins only after successful unlock.

Phase 4 therefore extends the share target without weakening P8/P32 privacy-lock behavior.

## Offline behavior

The service-worker handoff and local IndexedDB commit require no network request.

An installed, already-controlled Notes PWA can therefore receive a supported share while offline, open from the staged token, and durably create the local note and attachments. Normal cloud synchronization remains a later independent concern.

## Consumption and cleanup ordering

Cleanup is deliberately ordered after durable local capture:

```text
stage -> validate/prepare -> atomic IndexedDB commit -> delete staged payload -> open note
```

The staged payload is never deleted before the durable transaction succeeds.

After a successful exact-once commit, cache cleanup is best-effort because the local ledger has become authoritative. A leftover cached response cannot create a duplicate.

Permanently invalid staged payloads are deleted rather than retried forever.

## Failure invariants

Phase 4 is blocked if any tested path can:

1. put shared bytes or user content into URL/query state;
2. silently create a partial note after rejecting one of the supplied files;
3. delete a valid staged share before durable local persistence succeeds;
4. create two notes from one share token;
5. expose staged content before privacy unlock;
6. require network access for local share capture;
7. bypass existing image privacy processing or attachment limits;
8. break consumption of a v1 text-only staged share;
9. make the exact-once ledger portable user data.

## Adversarial coverage

Phase 4 adds coverage for:

- manifest file declarations;
- installed-PWA text sharing regression;
- installed-PWA image + PDF sharing;
- supported file sharing while offline;
- service-worker all-or-nothing rejection with a mixed supported/unsupported handoff;
- same-token replay/exact-once behavior;
- privacy-lock deferral and post-unlock consumption;
- legacy `notes-share-target-v1` compatibility;
- unsupported staged-file rejection without a partial note;
- device-local exclusion of share-capture ledger settings from portable data.

## Backend impact

Phase 4 requires no Supabase DDL, RLS, RPC, or Storage-policy change.

The durable result is written to the same local Notes/attachments stores already synchronized by the existing v1.1 sync engine. Attachment cloud upload remains governed by Phase 3's immutable content-addressed storage contract.

## Definition of done

Phase 4 is complete when:

- supported image/file handoffs are accepted by the installed-PWA manifest and service worker;
- local validation uses the established attachment safety rules;
- note + attachments + exact-once ledger commit atomically;
- replay cannot duplicate capture;
- privacy lock delays consumption without disclosure;
- capture works offline;
- legacy text-only staged shares remain compatible;
- invalid/mixed unsupported shares cannot create partial durable notes;
- all permanent CI, browser, PWA/offline, P20/P34, and A8 gates pass on the exact Phase 4 head.
