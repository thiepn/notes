# A6 — Production Certification & Legacy Removal

**Consumer:** Notes  
**Date:** 2026-09-13  
**Branch:** `a6-production-certification-current`  
**Implementation state:** Implemented; certification validation in progress

## Final account contract

Notes uses the shared THIEPN Account Supabase project and canonical browser auth key `sb-hycegznamzjhwinegaai-auth-token`.

The retired Notes-specific key is `notes.supabase.session.v1`. A6 ends the migration period: Notes no longer promotes that retired session into shared THIEPN Account storage. The retired key is deleted during auth-storage reads/writes.

Notes also reacts to canonical session changes emitted by other same-origin tabs/apps. Shared sign-out clears Notes' in-memory authenticated state without deleting the local Notes library. A new/replaced shared session is adopted and revalidated through the normal Notes authorization path.

## A6 legacy inventory and disposition

| Legacy artifact | A6 disposition |
| --- | --- |
| `notes.supabase.session.v1` | Ignored as auth input and deleted with targeted cleanup |
| Legacy-to-shared token promotion | Removed |
| Shared THIEPN Account storage | Retained as the only persisted session authority |
| Cross-tab canonical session propagation | Implemented against the shared storage key |
| Notes content, attachments, sync records and ownership data | Preserved |

No broad browser-storage wipe is used.

## Automated gates

The auth-storage and A6 cross-app browser tests verify:

- the exact shared and retired key contracts;
- rejection/cleanup of a retired-only session;
- preservation of an existing shared session;
- shared-only session writes/removals;
- immediate in-memory sign-out when another same-origin app/tab removes the canonical session;
- adoption of a valid canonical session created by another same-origin app/tab;
- absence of legacy-session reconstruction during those flows.

Normal pull-request CI additionally covers formatting, architecture/release contracts, lint, typecheck, unit tests, production build, cross-browser compatibility, release E2E, release certification and PWA offline behavior.

## Production database authorization audit

A6 inspected the live canonical Supabase project instead of relying only on repository configuration.

- `notes_sync_records` permits authenticated CRUD only through RLS policies bound to `auth.uid()` and `has_notes_sync_access()`.
- UPDATE has both `USING` and `WITH CHECK`, preventing ownership reassignment through an update.
- No anonymous grants were found on the private Notes/Diet consumer tables audited.
- The authenticated-callable Notes/THIEPN `SECURITY DEFINER` RPCs reported by the Supabase security advisor were reviewed: they use an empty `search_path`, restrict execution to authenticated/service roles, and scope user operations through `auth.uid()` with additional confirmation/MFA/shared-identity checks where applicable.
- Supabase leaked-password protection remains disabled and is a pending production Auth hardening setting; it must be enabled through project Auth configuration before final certification if the project plan supports it.

## Production/manual certification matrix

| Check | Status |
| --- | --- |
| Existing shared THIEPN Account restores in Notes | PENDING MANUAL |
| Existing pre-A6 user retains Notes ownership/data | PENDING MANUAL |
| Sign-in flow on production origin | PENDING MANUAL |
| Cross-tab shared-session propagation | AUTOMATED PASS; LIVE SMOKE PENDING |
| Sign-out propagation across supported apps/tabs | AUTOMATED PASS; LIVE SMOKE PENDING |
| Expired/revoked session recovery | PENDING MANUAL |
| Offline vs signed-out state | AUTOMATED COVERAGE; LIVE SMOKE PENDING |
| Multi-device security-change behavior | PENDING MANUAL |
| Account deletion behavior | PENDING MANUAL |
| Chromium production smoke test | PENDING MANUAL |
| Firefox/Zen production smoke test | PENDING MANUAL |
| Safari/WebKit production smoke test | PENDING MANUAL |
| Supabase leaked-password protection | PENDING PROJECT SETTING |

## Security findings resolved

1. Notes previously treated an app-specific migration token as eligible to become the shared THIEPN Account session when no shared session existed. A6 removes that second authentication source and leaves targeted cleanup only.
2. Notes previously kept a shared session in React state without reacting to canonical storage changes made in another app/tab. A6 adds canonical storage-event propagation and browser regression coverage.
3. Permanent THIEPN Account documentation previously described the A5 legacy-session promotion behavior. A6 replaces that text with the final single-authority architecture.

## Consumer rule

Notes may consume THIEPN Account identity and use the authenticated UUID for ownership/sync authorization. It must not authenticate from a retired app-specific session, generate a canonical user ID, own passwords, or maintain a second canonical account/session.

## Verdict

**NOT CERTIFIED — automated CI and manual production validation must both complete.**
