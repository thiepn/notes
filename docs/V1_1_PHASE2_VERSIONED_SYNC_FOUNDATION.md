# Notes v1.1 — Phase 2: Versioned Sync Foundation

## Goal

Phase 2 replaces the last-write-wins remote mutation boundary with server-enforced optimistic concurrency while preserving the existing local-first model and P6 conflict-copy behavior.

The Phase 2 rule is:

> A client may mutate a remote identity only if the server row still has the exact version that client observed before reconciliation.

Phase 3 remains responsible for immediate same-pass reconciliation after a rejected CAS and for immutable/content-addressed attachment objects.

## Production schema foundation

Migration `20260916221327_notes_v11_versioned_sync_foundation` adds:

```sql
version bigint not null default 1
```

A `BEFORE INSERT OR UPDATE` trigger owns the value:

- INSERT always stores version `1`;
- UPDATE stores `old.version + 1`;
- browser clients never choose the next version.

The existing primary key, payload columns, RLS policies, ownership gate, account integration, and `updated_at` trigger remain unchanged.

The migration was applied before the v1.1 client changes and is intentionally backward-compatible with v1.0.1: an old unconditional upsert still succeeds, but the server increments the version rather than allowing the old client to reset it.

A transactionally rolled-back production probe verified insert `1` -> update `2` without retaining probe data.

## Versioned transport

`src/features/sync/versionedSyncApi.ts` owns the Phase 2 record transport.

### Reads

Remote reads now request the server `version` alongside the existing identity, payload, hash, timestamps, and tombstone metadata.

The transport rejects:

- records belonging to another account;
- missing/non-positive/non-integer versions;
- non-advancing pagination cursors;
- oversized pagination loops.

Existing bounded safe-read retry and privacy-safe operational logging are retained.

### Creates

A client that observed no remote row performs a plain `POST` with no `on_conflict` merge behavior.

- successful creation must return exactly one row at version `1`;
- a primary-key `409` is classified as `SyncWriteConflictError`;
- the existing row is never overwritten by a concurrent create.

### Updates

An existing record update is a `PATCH` filtered by:

```text
user_id
entity_type
entity_id
version = observed version
```

The payload never contains a client-selected `version`.

- one returned row at `observed + 1` means success;
- zero returned rows means the observation became stale;
- more than one row or a skipped version is treated as invalid server behavior.

### Tombstones

Remote deletion uses the same conditional `PATCH`; a stale local delete therefore cannot tombstone a newer remote edit.

Attachment binary cleanup now occurs only after the attachment tombstone CAS succeeds. Phase 3 will replace mutable attachment object paths with immutable content-addressed generations.

## Sync-engine integration

Every write path now carries the version observed in the same reconciliation snapshot:

- local-only create -> expected `null`;
- local update -> current remote version;
- local resurrection over a tombstone -> tombstone version;
- timestamp-selected local winner -> current remote version;
- local delete -> current remote version.

A `SyncWriteConflictError` is expected concurrency rather than a network/server failure:

- the previous shadow entry is retained;
- the item is reported pending/deferred;
- it is counted as a conflict;
- the stale mutation is not retried blindly;
- the final remote snapshot is still fetched, so the next reconciliation starts from fresh cloud state.

Phase 3 will consume that fresh state in the same synchronization operation rather than waiting for the next pass.

## Sync shadow

`ShadowEntry` now optionally records:

```text
remoteVersion
```

The field is optional so existing v1.0.1 hash-only shadow JSON remains readable without migration.

When an old shadow entry still agrees by hash with the current local/remote content, the next successful sync transparently replaces it with a version-aware entry.

Rejected CAS writes cannot advance the shadow because their keys stay blocked and retain the previous acknowledged entry.

Sync shadow data remains internal device-local synchronization metadata and is still excluded from portable backup/restore.

## Phase 2 verification

Permanent unit coverage verifies:

- versioned remote reads;
- invalid version rejection;
- create without merge/upsert semantics;
- concurrent create classification;
- exact-version update filters;
- zero-row stale update classification;
- exact single-step server version increments;
- legacy shadow upgrade;
- blocked/rejected mutations retaining the previous remote version.

Browser coverage verifies:

- a stale local update cannot overwrite a newer remote edit;
- a concurrent create cannot merge over the remote identity;
- a stale local delete cannot tombstone a newer remote edit;
- existing P6 conflict-copy behavior still runs through the versioned cloud protocol;
- changed-during-upload state remains pending for the next sync.

## Security/advisor review

The migration did not change Notes RLS policies or expose any new RPC/function. `notes_sync_records` remains ownership-scoped for SELECT/INSERT/UPDATE/DELETE and RLS remains enabled.

Post-migration Supabase advisors reported no new Notes-specific security or performance finding caused by the version column/trigger. Existing shared-project advisories for unrelated tables and pre-existing account RPCs remain outside the bounded Phase 2 scope.

## Deliberate Phase 2 boundaries

Phase 2 does not yet add:

- same-pass post-CAS reconciliation;
- content-addressed attachment object paths;
- attachment-generation garbage collection;
- manual conflict-resolution UI;
- CRDT/live collaborative editing;
- rich file/image Web Share Target capture.

Those boundaries are deliberate and match the v1.1 implementation sequence.

## Exit gate

Phase 2 is complete only when the exact branch head passes the standard Notes CI suite, including formatting, foundation/release contracts, lint, TypeScript, unit tests, production build/performance, cross-browser compatibility, complete Chromium release regression without retries, P20/P34 certification, and PWA/offline certification.
