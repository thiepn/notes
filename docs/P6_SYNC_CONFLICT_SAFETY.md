# P6 — Sync, Conflict Safety & Cross-Device Reliability

P6 closes the largest remaining data-integrity gap in Notes sync: concurrent edits on two devices may still require deterministic winner selection, but the losing document version must no longer disappear silently.

## Product goal

Cross-device sync remains conservative snapshot reconciliation, not collaborative editing. P6 does not pretend to provide CRDT semantics. Instead it strengthens the existing model around one explicit rule:

> When two independently changed versions of the same note collide, Notes may choose which version remains at the original note ID, but it must preserve the losing document state as a normal recoverable note.

## Conflict copies

When the sync engine detects a note-level conflict, P6 creates one active **conflict copy** before applying timestamp resolution.

The copy:

- receives a new note ID,
- remains active and unpinned so it is easy to find,
- preserves the losing note type, color, title/body, or checklist content,
- remaps checklist item IDs and parent relationships safely,
- adds a searchable title suffix identifying whether the losing version came from **this device** or the **cloud**,
- includes an ISO timestamp in the title,
- uses only the existing notes and checklist-item tables.

The original note ID still resolves deterministically using the existing timestamp rule. The conflict copy is intentionally an ordinary note rather than hidden sync metadata: it can be searched, edited, archived, exported, backed up, or deleted through normal product behavior.

## Text conflicts

If the cloud version loses, the exact cloud title/content/color is validated and copied locally before the local winner is uploaded.

If the local version loses, the exact local title/content/color is copied before the cloud winner replaces the original note.

A malformed or checksum-invalid cloud version is never copied and never allowed to replace local content. The record remains failed/pending for a later retry.

## Checklist conflicts

Checklist preservation is document-aware rather than title-only.

For a losing local checklist, P6 snapshots the current local checklist rows before the cloud version is applied.

For a losing cloud checklist, P6 reconstructs the remote checklist from the already downloaded remote record set. Every active remote checklist row used by the copy must:

- belong to the current account,
- match its remote entity ID,
- pass payload checksum validation,
- pass the existing checklist-item schema.

Copied checklist rows receive new IDs. Parent links are remapped to the corresponding copied parent, preventing conflict copies from pointing back into the original checklist.

## First-sync collisions

The same preservation rule applies when the first merge between an existing local library and an existing cloud library encounters the same note ID with divergent content. First sync therefore remains a merge, but a collision cannot silently discard one document version.

## Existing sync behavior retained

P6 keeps the existing safeguards:

- local work continues offline,
- active editors defer incoming writes,
- malformed ownership or checksum data is rejected,
- changed-during-upload records remain pending,
- Web Locks serialize participating same-origin sync calls,
- incoming note replacement still checkpoints revision history,
- deletions continue to favor recoverable surviving content,
- failed records keep their previous sync shadow and retry later,
- local and remote snapshots are never acknowledged while divergent.

## Persistence and backend boundary

P6 does **not** require an IndexedDB migration or Supabase schema change.

Conflict copies are normal local note/checklist records. Once created, the existing sync engine sees them as new local entities and uploads them on a subsequent reconciliation pass if cloud sync is enabled. This deliberately reuses the normal replication path instead of inventing a conflict table or backend protocol.

## Deliberate boundaries

P6 does not add:

- CRDT or simultaneous collaborative editing,
- server-side compare-and-swap transactions,
- a dedicated conflict database/table,
- automatic semantic merging of two text bodies,
- automatic checklist three-way merging,
- attachment duplication into conflict copies,
- duplicate labels/reminders for conflict copies,
- end-to-end encryption claims,
- changes to account ownership or Supabase RLS.

Attachments, labels, reminders, and other related entities remain governed by their existing independent sync records. The conflict copy guarantees preservation of the core document state: text or checklist content.

## Release invariants

P6 is releasable only if:

1. A losing cloud text version is preserved before a local winner is uploaded.
2. A losing local text version is preserved before a cloud winner is applied.
3. Losing checklist state preserves item text, checked state, order, and nesting.
4. Conflict copies receive new note/item IDs and cannot reference original checklist parents.
5. Invalid remote checksums block preservation/resolution instead of creating corrupted copies.
6. Only one conflict copy is created for the note-level collision in a reconciliation pass.
7. Conflict copies trigger the normal workspace refresh so they become visible without a reload.
8. Existing sync retry/deferred/shadow behavior remains intact.
9. P1–P5 behavior, full Chromium regression coverage, and PWA/offline certification remain green.
10. No IndexedDB migration or backend schema change is introduced.
