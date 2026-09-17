# Notes v1.1 — Trust & Capture

## Release intent

Notes v1.1 is a bounded post-v1 release that strengthens two real daily-use boundaries without reopening the product roadmap:

1. **Trust** — cloud synchronization must reject stale remote writes at the server boundary instead of relying only on client snapshot timing.
2. **Capture** — the existing installed-PWA share target must grow from text/title/URL capture to safe image and supported-file capture through the existing attachment pipeline.

The release does **not** rebuild features that are already complete. P7 already provides the complete human-readable Markdown/attachment portable archive, and P10 already provides text/title/URL Web Share Target capture plus installed-app shortcuts. Those capabilities become permanent regression gates for v1.1.

The certified v1.0.1 release at `5c24911d64ef8652ea92b0980eacf354d488a518` is the v1.1 baseline.

## Scope correction after repository audit

The original v1.1 proposal assumed Share-to-Notes and full-library portable Markdown export were missing. Repository inspection showed otherwise:

- P7 exports the complete library as Markdown plus original attachment bytes, `manifest.json`, and `README.md`.
- P10 accepts installed-PWA shares through a POST share target and a one-time device-local Cache Storage handoff.
- P6 already preserves losing note/checklist document versions as ordinary conflict copies when the client detects concurrent divergence.
- P31 already explains degraded sync and conflict-copy activity to the user.

The remaining sync weakness is narrower but important: `notes_sync_records` is currently written through an unconditional REST upsert. Two devices can therefore read the same remote state and later both write; the second network write can replace the first even though each client behaved correctly relative to its stale observation.

v1.1 closes that server-boundary race.

## Existing production architecture

### Remote record identity

The Supabase table `public.notes_sync_records` is keyed by:

```text
(user_id, entity_type, entity_id)
```

The synchronized entity types remain:

```text
note
checklist_item
label
note_label
attachment
reminder
revision
```

The current record payload includes payload JSON, payload hash, client update time, deletion time, and server update time. RLS is enabled and the existing SELECT/INSERT/UPDATE/DELETE policies require both authenticated ownership and Notes sync access.

### Current conflict safety

The current client keeps a device-local sync shadow and compares local and remote hashes against the previously acknowledged state. If both sides changed, P6 preserves the losing core note/checklist state before timestamp-based winner selection.

This remains valuable and must not be removed. v1.1 adds a lower-level guarantee beneath it: even after reconciliation begins, a write based on an obsolete remote observation must be rejected by the server.

### Current share target

The P10 share target originally accepted:

```text
title
text
url
```

The service worker stores the payload in a bounded device-local handoff cache and redirects with only an opaque share token. Successful consumption removes the one-time payload; failed note persistence leaves it recoverable for retry.

Phase 4 extends this privacy model to supported attachments without placing shared bytes in URL state. See `V1_1_PHASE4_RICH_SHARE_CAPTURE.md` for the implemented contract.

## T1 — Server-enforced optimistic concurrency

### Core invariant

> A cloud mutation may succeed only if the remote record still has the version that the client observed before deciding to mutate it.

A stale client must never overwrite a newer remote record merely because its request arrived later.

### Remote version

Add an application-visible monotonic integer to `public.notes_sync_records`:

```sql
version bigint not null default 1
```

The version is server-controlled.

- New rows begin at version `1`.
- Every UPDATE increments the stored version exactly once.
- Clients do not choose the next version.
- Existing `updated_at` remains server timestamp metadata, not concurrency authority.
- `client_updated_at` remains useful for deterministic presentation/fallback logic, not stale-write authorization.

A BEFORE UPDATE trigger is preferred for incrementing the version so both current v1.0.1 clients and v1.1 clients advance the counter during the rollout window.

### Conditional update contract

A v1.1 client updating an existing record must filter by all identity columns plus the version it observed:

```text
user_id = current user
entity_type = expected type
entity_id = expected id
version = expected version
```

The update requests the resulting row representation.

- Exactly one returned row: mutation succeeded; the returned version becomes the observed remote version.
- Zero returned rows: stale observation or missing row; treat this as a concurrency conflict, never as success.
- Authorization/network/server failure: preserve the previous sync shadow and retry through existing failure behavior.

### Creation contract

Creation must not use merge/upsert semantics.

A client that observed no remote row performs a normal INSERT relying on the existing primary key. If another device created the identity first, the uniqueness conflict is treated as concurrent creation and the current remote row is fetched before reconciliation.

### Tombstone contract

Deletion continues to use durable remote tombstones, but converting a live row into a tombstone is also a conditional versioned UPDATE. A stale delete must not erase a newer remote edit.

### Shadow contract

The next sync shadow version records the acknowledged remote version in addition to the local and remote signatures. Remote version metadata is device-local synchronization state and remains excluded from portable backup/restore, consistent with P17.

The shadow is acknowledged only when local and remote state agree or when the existing acknowledged-deletion rule applies. A rejected CAS mutation cannot advance the shadow.

### Stale-write handling

When conditional mutation fails because the version changed:

1. fetch the current remote record;
2. validate ownership, identity, payload schema, and payload hash through the existing validation path;
3. reclassify the local/current-remote relationship against the last acknowledged shadow;
4. preserve a P6 safety copy when a note-level divergent conflict requires one;
5. apply the existing recoverability-first rules for edit/delete races;
6. retry only after a new reconciliation decision has been made against the new remote version.

Blind automatic retry of the same rejected write is forbidden.

### No CRDT claim

v1.1 is not simultaneous collaborative editing and does not introduce CRDT semantics. It provides optimistic concurrency: stale writes are rejected, divergent states are preserved, and the existing local-first editing model remains authoritative on each device.

## Attachment concurrency

Adding CAS only to `notes_sync_records` is insufficient because current attachment upload uses a stable object path and overwrite semantics before the metadata row is written.

### Required invariant

> A stale device must not overwrite attachment bytes that belong to a newer remote attachment record before its metadata CAS is rejected.

### Immutable object path

v1.1 attachment uploads use a content-addressed path under the existing private user namespace:

```text
<user-id>/<attachment-id>/<checksum>
```

The checksum is the already validated attachment content checksum.

Consequences:

- different attachment bytes cannot overwrite one another;
- an upload may happen before metadata CAS without corrupting the currently referenced object;
- the remote record remains the authority for which immutable object path is active;
- legacy `<user-id>/<attachment-id>` paths remain readable during migration;
- no bulk rewrite of existing attachment records is required.

A rejected metadata CAS may leave an unreferenced immutable object. v1.1 favors data safety over eager deletion; orphan cleanup must never delete an object that a current remote record references.

### Storage authorization

The existing private `notes-attachments` bucket and ownership/RLS policy model remain in force. v1.1 does not make the bucket public and does not weaken the account access gate.

## T2 — Rich Share-to-Notes capture

### Existing behavior retained

Text/title/URL sharing keeps the P10 one-time Cache Storage handoff. Shared content is never placed in query parameters or fragments; only an opaque share token appears in fragment state.

### Implemented payload

Phase 4 additionally accepts a bounded list of supported attachment files:

- images accepted by the existing privacy-safe image pipeline;
- supported voice/audio files;
- PDF, supported Office document formats, plain text, Markdown, CSV, and JSON;
- no executable or unknown file types.

The service worker uses all-or-nothing validation for supplied files: it must not silently drop an unsupported/empty/invalid file and persist the remainder as a partial note.

The app creates one recoverable staged capture and validates attachments again before durable persistence. Shared images pass through the same image sanitization/metadata-removal path used by ordinary capture.

### Staging and crash safety

Incoming share payloads remain bounded and device-local.

- The v2 service worker stages text metadata plus shared `File` objects in Cache Storage without exposing contents in the URL.
- v1 text-only staged JSON remains readable during rollout.
- The opaque token remains until the note and all accepted attachments are durably persisted.
- A reload after a failed local write can retry the same staged share.
- Note, attachments, and a device-local exact-once ledger commit in one IndexedDB transaction.
- Replaying the same token after commit resolves to the already-created note rather than creating a duplicate.
- Privacy lock delays consumption, and lock-screen UI does not reveal staged title/text/file names.
- Local capture remains functional while offline.

### Scope boundary

v1.1 does not add webpage scraping, background URL fetching, automatic summaries, OCR-on-share, transcription-on-share, or remote upload before local persistence succeeds.

## Preserved portability contract

P7 portable export is already complete and is not redesigned in v1.1.

The following remain release invariants:

- full active/archive/trash library coverage;
- Markdown plus YAML-compatible metadata;
- original attachment bytes;
- filesystem-safe collision-resistant paths;
- attachment hashes in the manifest;
- `manifest.json` and `README.md`;
- exact JSON backup remains the authoritative Notes restore format.

New synchronization metadata and the Phase 4 exact-once share-consumption ledger remain absent from portable user data.

## Migration and rollout contract

The database migration must be backward-compatible with the deployed v1.0.1 client while v1.1 is rolling out.

1. Add `version bigint NOT NULL DEFAULT 1`.
2. Add a server-side BEFORE UPDATE increment trigger.
3. Keep current row identity, RLS policies, payload columns, and existing `updated_at` trigger.
4. Verify old unconditional updates still succeed and increment version rather than resetting it.
5. Deploy the v1.1 client only after the schema is live and verified.
6. Do not remove backward compatibility in v1.1.

Phase 4 requires no additional Supabase DDL, RLS, RPC, or Storage-policy mutation.

## Security requirements

- RLS remains enabled on `public.notes_sync_records`.
- SELECT remains ownership-scoped because conditional UPDATE requires visibility of the target row.
- UPDATE retains both ownership `USING` and ownership `WITH CHECK` policy enforcement.
- The browser continues to use only the publishable Supabase key; no service-role/secret key enters client code.
- Attachment storage remains private and ownership-scoped.
- No new `SECURITY DEFINER` function is introduced merely to bypass RLS.
- Shared attachment bytes remain in local Cache Storage/IndexedDB until normal synchronization later uploads them through existing authenticated attachment sync.

## Failure invariants

v1.1 is blocked if any tested path can do one of the following:

1. overwrite a newer remote record from a stale observation;
2. convert a newer remote edit into a tombstone from a stale delete;
3. overwrite newer attachment bytes before record-level concurrency rejection;
4. acknowledge a rejected or divergent state into the sync shadow;
5. lose both versions of a detected note/checklist conflict;
6. delete a valid staged share before durable local capture succeeds;
7. expose staged shared content while privacy lock is active;
8. create duplicate notes from one share token;
9. silently produce a partial note from a mixed valid/invalid file handoff;
10. regress P7 portable export, P10 text/URL sharing, P17 offline/recovery behavior, P31 sync truthfulness, or P34 release gates.

## Implementation sequence

### Phase 1 — Architecture & contracts

- audit the live remote table, RLS, storage bucket, existing sync engine, existing share target, and portable export;
- define the version/CAS protocol, attachment object contract, migration compatibility, capture extension, and failure invariants;
- make no production schema mutation.

### Phase 2 — Versioned sync foundation

- add remote version support and server-managed incrementing;
- replace existing-record unconditional upserts with conditional writes;
- make creates uniqueness-safe;
- version tombstones;
- upgrade the local sync shadow without making it portable user data;
- add deterministic stale-write unit/integration coverage.

### Phase 3 — Conflict and attachment safety

- reconcile CAS rejections immediately against freshly fetched remote state;
- preserve P6 safety-copy guarantees;
- make attachment object paths immutable/content-addressed;
- cover edit/edit, edit/delete, create/create, attachment/attachment, and interrupted-upload races.

### Phase 4 — Rich capture — implemented

- extended manifest share-target file declarations;
- added private bounded v2 file staging while retaining v1 handoff compatibility;
- reused established image/attachment safety rules;
- added atomic note + attachment + exact-once-ledger persistence;
- preserved privacy-lock deferral and offline local capture;
- added all-or-nothing validation and adversarial replay/lock/offline/legacy coverage.

### Phase 5 — Adversarial hardening

- two-client concurrency simulation;
- stale writes arriving in both orders;
- interrupted network requests;
- active-editor deferral plus concurrent remote mutation;
- multi-tab plus multi-device combinations;
- large/malformed shared-file payloads;
- portable export and backup regression coverage.

### Phase 6 — v1.1 certification and release

- update package/release contract to `1.1.0` only after implementation is complete;
- run complete static, unit, browser, compatibility, PWA/offline, P20/P34, and v1.1 focused gates with release retries disabled where required;
- deploy only the certified main SHA;
- run production smoke for text/URL sharing and supported file sharing;
- publish `v1.1.0` only after production smoke passes.

## Explicit non-goals

v1.1 does not add:

- CRDT/live collaborative editing;
- end-to-end encryption;
- AI or embeddings;
- PDF OCR or document intelligence;
- a new editor;
- a plugin system;
- project management or calendar features;
- another visual redesign;
- a second portable export format;
- a second conflict database unless implementation evidence proves the existing recoverable-copy model insufficient.

## Definition of done

Notes v1.1 is complete only when:

1. stale remote updates and deletes are rejected atomically by server-observed version;
2. rejected writes trigger fresh reconciliation instead of blind retry;
3. note/checklist conflict preservation remains intact;
4. attachment bytes cannot be overwritten by a stale client before metadata conflict detection;
5. existing text/title/URL share capture remains intact;
6. supported image/file shares can be captured privately, atomically, offline, and exactly once;
7. portable archive and exact backup contracts remain unchanged;
8. v1.0.1 local libraries upgrade without local data migration loss;
9. the shared Supabase backend retains current authorization boundaries;
10. all permanent release gates and v1.1 adversarial gates pass on the exact release SHA.
