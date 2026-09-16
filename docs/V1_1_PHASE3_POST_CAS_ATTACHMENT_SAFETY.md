# Notes v1.1 — Phase 3: Post-CAS Reconciliation & Immutable Attachment Safety

## Goal

Phase 3 closes the two safety boundaries deliberately left after Phase 2:

1. a rejected compare-and-swap mutation is re-observed and reconciled inside the same synchronization call instead of waiting for a later sync invocation;
2. attachment bytes are stored in immutable content-addressed object generations so a stale client cannot overwrite the bytes referenced by a newer remote record before metadata CAS rejection occurs.

Phase 3 does not introduce collaborative editing or CRDT semantics. The existing local-first model, versioned remote records, P6 conflict copies, and recovery-first rules remain in force.

## Same-pass CAS reconciliation

`src/features/sync/syncEngine.ts` performs bounded reconciliation rounds.

Each round begins by fetching a fresh versioned cloud snapshot and rebuilding the local snapshot against it. If a write is rejected by `SyncWriteConflictError`, the rejected request is not replayed. Instead, another round starts from the newly observed remote state and the relationship is classified again.

The loop is capped at three rounds. If a record continues to race through all three observations, it remains pending with its previous acknowledged shadow rather than looping indefinitely or pretending that synchronization succeeded.

### Parent/dependent ordering

A CAS rejection for a note blocks its dependent checklist items, reminders, attachments, note-label links, and revisions for the rest of that stale round.

Those dependent records become eligible again only after the next fresh cloud snapshot. This prevents child records from being uploaded against a parent decision that has already become obsolete.

### Recovery artifacts

P6 safety copies and revision checkpoints created during conflict resolution are ordinary new local data. They may remain pending for a later upload even when the originally rejected identity has already been reconciled successfully in the same sync call.

That is intentional: the Phase 3 invariant concerns immediate reclassification of the stale mutation, not forced publication of every newly created recovery artifact before the synchronization call returns.

## Immutable attachment generations

New attachment uploads use:

```text
<user-id>/<attachment-id>/<sha256-checksum>
```

The checksum is the attachment's existing SHA-256 content checksum.

`src/features/sync/attachmentStorage.ts` owns this transport.

### Upload contract

Before upload, the client hashes the actual local Blob and requires it to equal the requested content address.

Storage upload uses no overwrite semantics:

```text
x-upsert: false
```

Different bytes therefore use different paths and cannot replace one another. If the immutable path already exists, the client does not assume success merely from the duplicate response. It downloads the existing object and accepts it only when both size and SHA-256 match the expected content.

### Metadata authority

The versioned `notes_sync_records` attachment row remains the authority for which immutable object generation is active.

A stale client may have uploaded an unreferenced immutable object before its metadata CAS is rejected. That object is harmless because it cannot overwrite the generation referenced by the current remote row.

Phase 3 deliberately does not eagerly delete such orphan generations. Data safety takes precedence over aggressive cleanup; future garbage collection must prove that an object is unreferenced before deleting it.

## Legacy attachment compatibility

Existing v1.0.1 attachment objects at:

```text
<user-id>/<attachment-id>
```

remain readable.

No bulk storage migration is required. When a local attachment checksum still matches the current remote metadata, the existing legacy path is reused. New or changed bytes use the immutable generation path.

Incoming attachment paths are accepted only when they are exactly either the legacy path for that identity or the content-addressed path for that identity and checksum.

## Download integrity

Remote attachment application validates, in order:

1. record ownership and identity;
2. metadata payload hash;
3. allowed storage path shape;
4. downloaded byte size;
5. downloaded SHA-256 checksum.

Invalid remote bytes never replace the local attachment.

## Deletion safety

Attachment deletion remains metadata-first.

The remote tombstone CAS must succeed before binary cleanup is attempted. Object deletion is additionally restricted to a path valid for that user, attachment identity, and checksum.

A stale delete therefore cannot remove the bytes referenced by a newer attachment record.

## Interrupted uploads

An interrupted immutable-object upload cannot publish attachment metadata because storage upload completes before record mutation.

The failed attachment key remains unacknowledged and pending. A later sync retries from local durable state, uploads the immutable object, and only then creates or updates the metadata row.

## Backend and authorization

Phase 3 requires no new database migration.

The existing private `notes-attachments` Storage policies already scope access by authenticated ownership and the first path segment equal to `auth.uid()`. The deeper content-addressed path remains inside that same ownership namespace.

No service-role key, public bucket, new RPC, RLS weakening, table, or index is introduced.

## Permanent verification

Unit coverage verifies:

- deterministic content-addressed path construction;
- legacy-path compatibility;
- no-overwrite upload headers;
- local byte/checksum preflight;
- idempotent existing-generation verification;
- rejection when an existing object does not match its content address.

Browser coverage verifies:

- stale edit/write rejection followed by same-pass fresh reconciliation;
- concurrent create preservation through the existing conflict-copy model;
- stale delete rejection followed by same-pass remote restoration;
- note CAS rejection blocks dependent checklist rows until a fresh read;
- concurrent attachment generations cannot overwrite one another;
- stale attachment metadata CAS leaves the newer remote object intact;
- remote attachment bytes are re-downloaded and checksum-validated after conflict;
- interrupted object upload publishes no metadata and succeeds on a later retry;
- existing P6 conflict-copy and V5 synchronization integrity behavior remains covered by the standard release suite.

## Advisor review

No Phase 3 DDL or policy mutation was required, and the post-implementation Supabase advisor pass exposed no new Notes-specific issue attributable to Phase 3.

The shared project still reports pre-existing findings, including executable Notes `SECURITY DEFINER` account RPCs and an unused Notes sync index. Those findings predate Phase 3 and are not changed by this bounded synchronization work.

Relevant Supabase guidance:

- `SECURITY DEFINER` advisor: <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>
- unused-index advisor: <https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>
- leaked-password protection: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

## Deliberate boundaries

Phase 3 does not add:

- CRDT/live collaborative editing;
- manual conflict-resolution UI;
- attachment orphan garbage collection;
- bulk migration of legacy object paths;
- end-to-end encryption;
- rich file/image Web Share Target capture.

Rich Share-to-Notes capture remains Phase 4.

## Exit gate

Phase 3 is complete only when the exact branch head passes the permanent Notes CI gates: formatting, foundation/release contracts, lint, TypeScript, unit tests, production build/performance budget, cross-browser compatibility, complete Chromium release regression without retries, P20/P34 certification, PWA/offline certification, and the A8 account consumer contract.

The PR remains unmerged until that exact-head evidence is green.
