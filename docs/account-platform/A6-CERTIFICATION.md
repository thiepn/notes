# A6 — Production Certification & Legacy Removal

**Consumer:** Notes  
**Date:** 2026-09-13  
**Branch:** `a6-production-certification`  
**Implementation state:** Implemented; certification validation in progress

## Final account contract

Notes uses the shared THIEPN Account Supabase project and the canonical browser auth key:

`sb-hycegznamzjhwinegaai-auth-token`

The retired Notes-specific session key is:

`notes.supabase.session.v1`

A6 ends the migration period: Notes no longer promotes that retired session into the shared THIEPN Account key. The retired key is deleted when auth storage is read or written.

## A6 legacy inventory and disposition

| Legacy artifact | A6 disposition |
| --- | --- |
| `notes.supabase.session.v1` | Ignored as authentication input and deleted with targeted cleanup |
| Legacy-to-shared session promotion | Removed |
| Shared THIEPN Account storage | Retained as the only persisted session authority |
| Notes content, attachments, sync records and ownership data | Untouched |

No broad browser-storage wipe is used.

## Automated gates

The dedicated auth-storage tests verify:

- Exact shared THIEPN Account storage-key contract.
- Exact retired Notes key contract.
- A retired Notes session by itself never creates an authenticated shared session.
- A valid shared THIEPN session is preserved while the retired key is removed.
- Session writes/removals target only the shared auth key and clean the retired key.

The normal Notes CI additionally runs the repository test/type/build quality gates configured for pull requests.

## Production/manual certification matrix

These checks require a deployed production origin, real authentication provider, multiple browser contexts/devices, or destructive account operations and therefore are not marked passed by unit tests.

| Check | Status |
| --- | --- |
| Existing shared THIEPN Account restores in Notes | PENDING MANUAL |
| Existing pre-A6 user retains Notes ownership/data | PENDING MANUAL |
| Google sign-in/callback where exposed by the account flow | PENDING MANUAL |
| Email/password sign-in | PENDING MANUAL |
| Sign-out propagates as expected across supported THIEPN apps/tabs | PENDING MANUAL |
| Expired/revoked session recovery | PENDING MANUAL |
| Offline vs signed-out state remains distinguishable | PENDING MANUAL |
| Multi-device password/security change behavior | PENDING MANUAL |
| Account deletion invalidates access and follows deletion policy | PENDING MANUAL |
| Chromium production smoke test | PENDING MANUAL |
| Firefox production smoke test | PENDING MANUAL |
| Safari/WebKit production smoke test | PENDING MANUAL |

## Security findings

### Resolved in A6

Notes previously treated an app-specific migration token as eligible to become the shared THIEPN Account session when no shared session existed. That was useful during A5 cutover but would leave two possible persisted sources of authentication truth. A6 removes promotion and keeps only cleanup of the retired key.

### Remaining validation

Provider/callback configuration, revocation, account deletion and multi-device behavior require live production validation.

## Consumer rules

Notes may consume THIEPN Account identity and use the authenticated UUID for ownership and sync authorization. It must not authenticate independently from a retired app-specific session, generate a canonical user ID, own passwords, or maintain a second canonical account/session.

## Verdict

**NOT CERTIFIED — automated CI and manual production validation must both complete.**

Do not change this verdict to `CERTIFIED` until every required automated gate is green and the applicable production/manual matrix has been executed with no unresolved critical/high finding.
