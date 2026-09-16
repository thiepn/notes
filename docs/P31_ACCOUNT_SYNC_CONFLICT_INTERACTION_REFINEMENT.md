# P31 — Account, Sync & Conflict Interaction Refinement

## Goal

P31 refines the existing THIEPN Account and Notes sync interaction layer without changing the sync protocol, cloud schema, local database schema, conflict-preservation algorithm, authentication provider, or record payloads.

The phase focuses on daily-use trust and recovery:

- users should know which account action is actually running;
- account inputs should not remain editable while their request is in flight;
- failed account actions should leave a deterministic retry point;
- offline, pending, and failed sync states should explain what remains safe locally and what to do next;
- the existing sync result counters should be visible instead of disappearing inside the provider;
- conservative conflict handling should explain when safety copies were preserved;
- manual session refresh must not silently look like an empty session list when the refresh itself failed.

## Action-specific busy state

`SyncSettings` now tracks the active account operation rather than exposing only a generic **Working…** message.

Examples include:

- **Signing in…**
- **Creating account…**
- **Claiming private workspace…**
- **Syncing now…**
- **Refreshing sessions…**
- **Signing out other devices…**
- **Deleting cloud Notes data…**

Only one settings mutation is allowed at a time.

While an account request is active:

- related settings sections expose `aria-busy`;
- editable account, password, setup, and destructive-confirmation inputs are disabled;
- competing buttons remain disabled;
- the submitted values therefore cannot drift while the request is running.

## Failure focus and retry

Account-action failures now render in a focusable `role="alert"` surface.

After an asynchronous failure:

- the busy state clears;
- form controls are re-enabled;
- the failure remains visible;
- focus moves to the alert so keyboard and assistive-technology users receive the result immediately;
- the original form values remain available for correction/retry unless the underlying action intentionally changed them.

No retry loop is introduced automatically for account mutations.

## Sync attention states

P31 adds explicit interaction copy for the three degraded sync states:

### Offline

The UI explains that Notes remain saved locally and that sync resumes automatically after reconnection. Manual checking remains available and returns the same local-safety message used by automatic offline detection.

### Pending

The UI explains that one or more local records are waiting for a safe sync point and directs the user to close an editor holding a newer local draft before retrying.

### Error

The UI states that the previous cloud sync did not complete and that local data was retained. If the engine reported failed records, their count is shown.

These states expose a clear **Retry sync** or **Check connection** action without altering automatic sync behavior.

## Last sync activity

The sync engine already returns structured counts for:

- uploaded records;
- downloaded records;
- cloud deletions;
- local deletions;
- conflicts;
- conflict safety copies;
- failed records;
- deferred/pending records.

P31 now surfaces those counters through a stable `formatSyncActivity` presentation helper. Zero-value counters are omitted; an unchanged sync reads **No record changes.**

The global sync indicator also includes the latest available detail in its accessible label/title.

## Conflict clarity

P31 does not create a new manual conflict-resolution system.

The existing sync engine remains authoritative and continues to resolve conservatively. When it reports `conflictCopies > 0`, Settings explicitly explains that safety copies were retained in Notes so a conflicting version is not silently lost.

This phase does not change:

- which version wins;
- when a conflict is detected;
- how a conflict copy is generated;
- conflict-copy titles or payloads;
- checklist conflict-copy reconstruction;
- sync shadow behavior.

## Session-list truthfulness

Background session-list refresh remains best-effort.

Manual **Refresh sessions**, however, now distinguishes API/network failure from a legitimately empty list. A failed manual refresh throws a user-visible retryable error instead of silently presenting the failure as if no session information existed.

When **Sign out other devices** succeeds but the follow-up list refresh fails, the success is retained and the message states that only the refreshed list is unavailable.

## Offline provider consistency

Manual `syncNow()` now sets the same explicit offline/local-safety message as the main sync path when `navigator.onLine` is false.

This changes presentation only; the app still waits for the browser `online` event and normal automatic sync cadence to resume cloud work.

## Permanent regression coverage

P31 adds:

- `src/features/sync/syncPresentation.test.ts`
  - sync activity summaries;
  - conflict/safety-copy counters;
  - offline/pending/error guidance;
- `e2e/p31-account-sync-conflict-interaction-refinement.spec.ts`
  - action-specific busy copy;
  - input locking during account requests;
  - control re-enable after completion;
  - focused retryable account failure.

The existing `e2e/account-sync.spec.ts`, sync unit tests, complete release E2E suite, P20 certification, and PWA/offline certification remain authoritative before merge.

Run the focused browser suite with:

```text
npm run e2e:p31
```

## Preserved boundaries

P31 does **not** change:

- IndexedDB schema or version;
- Supabase tables, RPC contracts, or storage buckets;
- authentication token/session format;
- account identity architecture;
- sync record format;
- sync interval or automatic retry cadence;
- upload/download/delete merge semantics;
- conflict detection or conflict-copy generation;
- backup/import/export formats;
- note/editor persistence semantics;
- privacy-lock behavior;
- attachment payload semantics.

P31 is an interaction, status-truthfulness, retry, and accessibility refinement over the existing account/sync engine.
