# A6 — Production Certification & Legacy Removal

**Consumer:** Notes  
**Date:** 2026-09-13  
**Branch:** `a6-production-certification-current`  
**Implementation state:** Implemented; certification validation in progress

## Final account contract

Notes uses the shared THIEPN Account Supabase project and canonical browser auth key `sb-hycegznamzjhwinegaai-auth-token`.

The retired Notes-specific key is `notes.supabase.session.v1`. A6 ends the migration period: Notes no longer promotes that retired session into shared THIEPN Account storage. The retired key is deleted during auth-storage reads/writes.

## A6 legacy inventory and disposition

| Legacy artifact | A6 disposition |
| --- | --- |
| `notes.supabase.session.v1` | Ignored as auth input and deleted with targeted cleanup |
| Legacy-to-shared token promotion | Removed |
| Shared THIEPN Account storage | Retained as the only persisted session authority |
| Notes content, attachments, sync records and ownership data | Untouched |

No broad browser-storage wipe is used.

## Automated gates

The dedicated auth-storage tests verify the exact shared and retired key contracts, rejection/cleanup of a retired-only session, preservation of an existing shared session, and shared-only session writes/removals. Normal pull-request CI remains responsible for the repository test/type/build gates.

## Production/manual certification matrix

| Check | Status |
| --- | --- |
| Existing shared THIEPN Account restores in Notes | PENDING MANUAL |
| Existing pre-A6 user retains Notes ownership/data | PENDING MANUAL |
| Sign-in flow on production origin | PENDING MANUAL |
| Sign-out propagation across supported apps/tabs | PENDING MANUAL |
| Expired/revoked session recovery | PENDING MANUAL |
| Offline vs signed-out state | PENDING MANUAL |
| Multi-device security-change behavior | PENDING MANUAL |
| Account deletion behavior | PENDING MANUAL |
| Chromium production smoke test | PENDING MANUAL |
| Firefox/Zen production smoke test | PENDING MANUAL |
| Safari/WebKit production smoke test | PENDING MANUAL |

## Security finding resolved

Notes previously treated an app-specific migration token as eligible to become the shared THIEPN Account session when no shared session existed. A6 removes that second authentication source and leaves targeted cleanup only.

## Consumer rule

Notes may consume THIEPN Account identity and use the authenticated UUID for ownership/sync authorization. It must not authenticate from a retired app-specific session, generate a canonical user ID, own passwords, or maintain a second canonical account/session.

## Verdict

**NOT CERTIFIED — automated CI and manual production validation must both complete.**
