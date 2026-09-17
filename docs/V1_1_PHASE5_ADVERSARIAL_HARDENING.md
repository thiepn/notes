# Notes v1.1 — Phase 5: Adversarial Hardening

## Purpose

Phase 5 is the final engineering hardening pass before v1.1 release certification. It does not add a new product feature. It attacks the Trust & Capture implementation from Phases 2–4 with composed failure scenarios that are unlikely during ordinary use but must still fail safely.

The phase preserves the v1.0.1 local-first product model and the v1.1 contracts already established for server-enforced optimistic concurrency, immutable attachment generations, and rich Share-to-Notes capture.

## Hardening change

### Exhaustive remote row identity validation

The versioned sync transport now validates every row returned by the remote page before the row enters reconciliation.

Every remote record must have:

- the authenticated user ID;
- one of the seven supported Notes sync entity types;
- an entity ID containing only the safe identity character set used by Notes (`A-Z`, `a-z`, `0-9`, `:`, `-`);
- a positive safe-integer server version.

An unknown runtime entity type or malformed identity is a hard read failure. TypeScript's compile-time `SyncEntityType` union is not treated as a substitute for validating untrusted JSON returned by the network.

The pagination cursor therefore derives only from a row that has already passed the same structural validation as every other row in the page. Validation is no longer effectively concentrated on the final cursor row.

This is client-side defense in depth. Phase 5 adds no Supabase DDL, RLS, RPC, Storage policy, or new backend service.

## Adversarial scenarios

### 1. Repeated CAS storm

A local note is first synchronized normally. The local device then edits it while the simulated remote changes immediately before each conditional write for all three allowed reconciliation rounds.

Required behavior:

- the sync call terminates after the bounded reconciliation limit;
- no blind fourth retry occurs;
- the local edit remains intact;
- the latest remote edit remains intact;
- the divergent identity remains deferred rather than falsely acknowledged;
- once the remote stops racing, a later sync re-evaluates from the retained shadow and converges safely.

The test deliberately exercises multiple fresh remote snapshots in one sync call instead of one isolated stale-write rejection.

### 2. Same-device simultaneous sync calls

Two `synchronizeNotes()` calls are started concurrently against the same local database.

Required behavior when the browser implements Web Locks:

- the per-account `navigator.locks` guard serializes the operations;
- one unsynced local note produces exactly one remote create;
- the second sync observes the first sync's acknowledged state rather than producing a duplicate-create conflict;
- neither call reports a failed record.

### 3. Active-editor dependency deferral

A checklist note with child checklist items is marked as actively edited when sync begins.

Required behavior:

- the note is not uploaded from underneath the editor;
- its dependent checklist rows are also deferred;
- no partial cloud document is created;
- after the editing marker is removed, a later sync uploads the parent and children normally.

This extends the existing active-document protection from a single note assertion to a parent/dependent document graph.

### 4. Exact-once capture under storage failure

The rich-share repository is forced to fail while persisting its exact-once ledger after the note and attachment writes have been issued inside the same IndexedDB transaction.

Required behavior:

- the commit rejects;
- the note write rolls back;
- the attachment write rolls back;
- no exact-once ledger is retained;
- a partial durable capture cannot survive the failed transaction.

The injected failure models quota/storage exhaustion at the most dangerous point in the transaction: after user content has begun to persist but before the share token can be acknowledged as consumed.

### 5. Two isolated device profiles

Two independent browser contexts represent two devices with separate IndexedDB databases but the same authenticated cloud account. Both create a different local document with the same note identity before the second device observes the first device's cloud create.

Required behavior:

- the first device can create the remote identity;
- the second device detects the divergent identity;
- the losing cloud document is preserved as an ordinary conflict copy;
- the newer local document can replace the original only through the observed remote version;
- a following sync on the first device converges it to the same winning document;
- both device profiles finish with the same current note while the losing version remains recoverable.

This is an isolated-storage device test, not two tabs sharing one IndexedDB database.

## Preserved prior adversarial coverage

Phase 5 relies on and keeps permanent the existing suites that already cover:

- stale update and stale delete CAS rejection;
- concurrent create collision;
- parent/dependent ordering after a rejected note write;
- attachment/attachment races;
- immutable object collision verification;
- corrupted attachment bytes;
- interrupted immutable attachment uploads;
- invalid cloud payload checksums;
- local edits made while an upload is in flight;
- offline startup and reconnect;
- rich image/PDF installed-PWA capture;
- offline file sharing;
- all-or-nothing share-target file validation;
- privacy-lock share deferral;
- same-token exact-once replay;
- v1 text-only staged-share compatibility;
- P7 portable export and exact backup contracts.

The device-local sync shadow and `internal.share-capture.*` exact-once ledger remain excluded from backup/portable settings through `isPortableSettingKey`.

## Deliberate safety boundaries

### CAS retry limit

Three reconciliation rounds remain the hard bound. Hitting the bound is not treated as convergence. The affected identity is left deferred for a later explicit/automatic sync.

### Immutable attachment orphans

A CAS loser may leave an unreferenced immutable content-addressed object. Phase 5 does not introduce eager garbage collection. An unreferenced immutable generation is preferable to deleting an object that a current metadata record may still reference.

### No live collaboration claim

The two-device tests validate optimistic concurrency and convergence, not CRDT/live collaborative editing. v1.1 still does not promise simultaneous character-level co-editing.

### No encryption claim

Privacy lock continues to gate the Notes UI. Cache Storage and IndexedDB are browser-profile-local storage, not passcode-derived end-to-end encryption.

## Release gates

Phase 5 is complete only when the exact final branch SHA passes:

1. Prettier formatting;
2. foundation contract;
3. release contract;
4. ESLint;
5. TypeScript;
6. complete unit suite;
7. production build and performance budget;
8. core Chromium/Firefox/WebKit compatibility;
9. complete Chromium release regression with retries disabled;
10. P20 certification with retries disabled;
11. P34 certification with retries disabled;
12. PWA/offline certification;
13. A8 Account Consumer Contract;
14. the new Phase 5 adversarial cases above.

No Phase 5 client code is merged or deployed merely because focused tests pass. The pull request remains draft until the exact-head permanent gates pass.

## Definition of done

Phase 5 is done when:

- malformed remote row identities/types are rejected before reconciliation;
- repeated stale-write races are bounded and remain recoverable;
- simultaneous same-device sync calls cannot duplicate one local create;
- active document graphs do not partially upload while being edited;
- failed exact-once share transactions leave no partial durable capture;
- isolated device profiles converge without losing the conflicting document;
- prior sync, attachment, share, backup, privacy, offline, and account contracts remain green;
- the exact final Phase 5 SHA passes the complete permanent CI and A8 gates.

After Phase 5, no further feature engineering belongs in v1.1. The only remaining phase is Phase 6 — v1.1 release certification, merge, deployment verification, and release publication.