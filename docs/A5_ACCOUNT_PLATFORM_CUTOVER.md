# A5 — Notes THIEPN Account Platform Cutover

## Scope

A5 moves Notes' common account/session semantics onto the certified THIEPN Account SDK/platform contract while preserving the mature Notes sync engine, local-first behavior, PWA/offline guarantees, attachment storage, private-workspace claim flow, and Notes-specific deletion/recovery operations.

Pinned contract:

- Account SDK: `1.2.0`
- Platform: `1.0.0`
- certified source SHA: `124221f39a932d50f9a86ad5c3da2d8fd1fe50af`
- app id: `notes`
- canonical session key: `sb-hycegznamzjhwinegaai-auth-token`

## What moved to the shared platform boundary

`src/features/sync/thiepnAccountPlatform.ts` now owns the reusable first-party account behavior used by Notes:

- canonical shared-session parsing/storage
- one-time migration from `notes.supabase.session.v1`
- email/password sign-in
- refresh-token exchange
- local-browser auth logout
- A4 app-activity metadata
- A3 AAL/MFA handoff state
- explicit SDK/platform/source pins

`supabaseApi.ts` keeps its public Notes-facing API but delegates those operations to the adapter. This avoids a large SyncProvider rewrite and preserves existing call sites.

## Refresh reliability

Notes already coalesced simultaneous refreshes so a single-use/rotating refresh token could not be consumed twice.

A5 preserves that map in `supabaseApi.ts` around the shared adapter's refresh operation. Failed requests are still removed from the map so a later retry can proceed.

The adapter preserves HTTP status through `AccountPlatformRequestError`; `supabaseApi.ts` maps it back to the existing `SupabaseRequestError` contract used by `SyncProvider`.

## Offline/local-first behavior

Storage reads remain synchronous and network-free.

Opening Notes offline does not perform platform writes. A4 account activity is triggered only from the existing online freshness path and is best-effort. Failure to record ecosystem metadata is caught and can never block:

- local note editing
- startup
- cloud sync
- attachment access
- sign-in
- workspace claim

## Data isolation

A5 does not move Notes content into the THIEPN Account platform.

The platform receives only `account_user_apps` connection/activity metadata for app id `notes`.

Notes retains ownership of:

- note/checklist/label/reminder/revision sync records
- attachment objects
- private workspace access/claim semantics
- local Dexie database
- backups/restores/import/export
- Notes-specific cloud-copy deletion

The A4 platform snapshot remains metadata-only and does not include Notes content.

## MFA staging

The adapter can report when an account has a verified factor but the current JWT is only `aal1`.

A5 does **not** turn on restrictive AAL2 policies for Notes data yet. The existing Notes sync UI has not been converted into a complete second-factor challenge surface in this consumer cutover, and enabling AAL2 data RLS prematurely would lock opted-in users out of sync.

The handoff state exists so that later enforcement can be introduced deliberately and tested end to end.

## Operations intentionally left Notes-specific

The following are not generic SDK concerns and remain in the Notes modules:

- private workspace access check and claim
- Notes sync record pagination/upsert
- attachment upload/download/delete
- Notes auth-session listing/revocation UI
- recovery/email-change callbacks and account-management UI
- Notes cloud deletion and ecosystem deletion preflight

A5 is not permission to collapse these product-specific operations into global account code.

## Permanent certification

The A5 contract is enforced by:

```bash
npm run account-platform:contract
```

It is included in `npm run release:check` and runs as an explicit CI step before lint/typecheck/tests/build/browser certification.

The exact A5 candidate must still pass Notes' complete existing certification stack:

- formatting
- foundation contract
- release contract
- A5 account-platform contract
- lint
- TypeScript
- unit tests
- production build/performance budget
- compatibility browser suite
- full release E2E without retries
- P20 certification suite
- PWA/offline certification

No existing P20/P21/P22 reliability requirement is relaxed by this cutover.
