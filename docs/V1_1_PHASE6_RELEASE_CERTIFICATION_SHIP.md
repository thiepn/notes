# Notes v1.1 — Phase 6: Release Certification & Ship

## Purpose

Phase 6 is release-only. Notes v1.1 feature engineering ended with the certified Phase 5 head `5581ce1cc70f9d160ec1f59731b380afe773bb83`.

This phase may change release metadata, certification contracts, deployment verification, and release documentation. It must not introduce new product features, synchronization semantics, database schema changes, RLS changes, storage-policy changes, visual redesigns, or roadmap expansion.

## Release candidate

The stable release target is `v1.1.0`.

The v1.1 release contains the already-implemented and adversarially hardened Trust & Capture scope:

- Phase 2: server-managed versioned sync records, conditional CAS updates/tombstones, uniqueness-safe creates, and version-aware device-local shadows;
- Phase 3: bounded fresh-snapshot reconciliation after CAS rejection plus immutable content-addressed attachment generations and byte validation;
- Phase 4: rich installed-PWA Share-to-Notes capture with bounded local staging, all-or-nothing file validation, atomic note/attachment/exact-once persistence, privacy-lock deferral, and offline capture;
- Phase 5: repeated-race, concurrent-sync, active-editor dependency, quota-failure, isolated-device convergence, malformed-remote-row, focus-race, and accessibility hardening.

The release-preparation commit changes only release metadata/contracts and production verification. The exact release-candidate SHA is the final PR head that passes every pre-merge gate.

## Pre-merge certification

Before PR #73 may merge, one exact release-candidate SHA must pass all of the following without substituting a different head:

- formatting;
- foundation contract;
- release contract;
- ESLint;
- TypeScript;
- complete unit suite;
- production build and performance budget;
- Chromium, Firefox, and WebKit compatibility;
- complete Chromium release regression with retries disabled;
- focused P20 certification with retries disabled;
- focused P34 certification with retries disabled;
- PWA/offline certification;
- A8 Account Consumer Contract.

A red gate blocks the release. Re-running a failing gate without understanding the failure is not release certification. Any required fix moves the candidate SHA and therefore requires exact-head certification again.

## Merge and deployment invariant

Once the exact release-candidate head is green:

1. PR #73 may be marked ready for review.
2. The PR must merge with the commit subject exactly `Release v1.1.0` and with the expected certified PR head SHA supplied to the merge operation.
3. The resulting merge commit becomes the authoritative release SHA.
4. Main CI must pass on that exact merge SHA.
5. The Pages deployment workflow may run only after successful main CI and must check out `github.event.workflow_run.head_sha` exactly.
6. The deployment job must deploy the artifact built from that same SHA.
7. Production smoke must pass before stable release publication.

No tag may be created before the production deployment and smoke gates succeed.

## Production verification

The post-deploy smoke sequence verifies the live shell, manifest, service worker, and the existing Phase 4 rich Share-to-Notes scenarios against `https://thiepn.dev/notes/` in a fresh Chromium profile.

The production browser smoke uses only device-local capture data created inside the disposable CI browser profile. It does not create a privileged production sync account or weaken account security merely to manufacture a credentialed smoke test. Versioned sync, conflict preservation, multi-device convergence, and account-consumer behavior remain required exact-head pre-merge gates.

Production rich-share smoke runs with retries disabled. A failed production share scenario blocks stable release publication.

## Stable release publication

The deployment workflow derives the stable tag from `package.json` and publishes `v1.1.0` only when all of these conditions hold:

- the deployed main commit subject is exactly `Release v1.1.0`;
- main CI succeeded for that exact SHA;
- deployment succeeded for that exact SHA;
- static production smoke succeeded;
- production rich Share-to-Notes smoke succeeded;
- no existing `v1.1.0` release points elsewhere.

If `v1.1.0` already exists, the workflow must verify that its tag SHA is exactly the certified production SHA and must fail rather than moving an existing stable tag.

## Stop condition

Phase 6 is complete only when:

- PR #73 is merged;
- main points to the release merge SHA;
- main CI is green on that SHA;
- the Pages deployment and production smoke are green on that SHA;
- the GitHub release `v1.1.0` exists;
- tag `v1.1.0` resolves to that exact release SHA;
- production remains available at `https://thiepn.dev/notes/`;
- no follow-up commit is required to make the release record truthful.

After that point, Notes v1.1 is frozen. Development returns to maintenance-only work for real defects, browser/platform regressions, security fixes, or an explicitly scoped future release. Phase 6 does not create a Phase 7 roadmap.
