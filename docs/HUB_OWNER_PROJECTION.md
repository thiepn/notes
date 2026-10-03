# H11 Notes owner projection

This is an owner-side server component, not a deployed endpoint or a browser feature. `server/hub/notesProjection.ts` is outside the Vite application graph. No route is mounted, no credentials are embedded, no hosted schema/grant is changed, and no private Hub flag is enabled. Notes continues to use its existing local-first database and optional cloud sync.

## What it implements

`createNotesHubHandler` accepts a trusted runtime's `authorize` and `query` dependencies and returns a standard Request/Response handler for a future POST `/hub/notes/v1` route. The runtime must authenticate a **consumer-bound purpose grant**, resolve current account/Notes entitlement, and execute the supplied SQL under a connection that preserves owner RLS. The handler does not turn a Supabase user JWT, caller JSON, Account connection or frontend feature flag into that grant.

The request binds Notes, summary/continue/search, an opaque request ID, canonical account UUID and exact grant revision. Workspace and translation are null for this pilot. Search text is at most 256 characters and travels in the request body only. Unknown fields, credentials in the body, other operations, device contexts, query-string transport, unsupported methods, malformed JSON/UTF-8 and bodies above 4 KiB are rejected.

Authorization requires the canonical owner, `thiepn-hub` consumer, `notes-hub` audience, exact `notes.hub.<operation>.read` permission, active account, current grant revision, unexpired grant and current Notes sync entitlement. Resolve those facts through trusted authorization/owner state, not `user_metadata`. They are checked before SQL and again before releasing a result. The second check rejects revocation/account restriction during the read. This is not an atomic database grant check; immediate enforcement at the actual data boundary remains a deployment prerequisite.

## Read behavior

The parameterized SQL reads **only metadata** from the existing `notes_sync_records` layout:

- UUID, title, note type, lifecycle/update fields and owner identity for validation;
- note entities only, with sync tombstones and Trash excluded;
- summary/continue: ten most recently updated active notes; Archive excluded;
- search: twenty case-insensitive **title** matches; Archive included; `%`, `_`, backslash, `*` and quote/SQL text are literal input, not filter syntax;
- deterministic timestamp/UUID ordering with a SQL LIMIT; no full-sync reader, pagination loop, total count or raw payload selection.

Continue represents recently edited synced notes, not last-opened local notes. Full body search remains inside Notes. A one-megabyte body stays in the owner database; a result contains only opaque UUID, title (160 UTF-16 units, no controls or split surrogate) and update time. Empty titles become `Untitled note`, never a body excerpt. Bodies, HTML, attachment paths, labels, reminders, checklist text and revisions are never output.

The output matches Hub provider contract v1 with `privacy:private`, `coverage:cloud-snapshot`, ready/empty status and a matching request/context. Observation time means this bounded cloud read occurred; source update time describes returned rows, not a global last-sync assertion. Unsynced local changes, privacy-lock state and local drafts are not adopted as account data. Explicit Hub-purpose sharing consent must precede a real grant.

Freshness is capped at five minutes and both authorization expiries. The overall request deadline is two seconds, including body, authorization and SQL. Abort/deadline wins even if a dependency ignores cancellation; a late dependency cannot release a response. Responses use `no-store`, no permissive CORS and generic failures without SQL, private search, token, title or count diagnostics. No retry, persistent cache or write operation is added.

## Runtime requirements before mounting

1. Supply a maintained verifier for the approved scoped-token protocol, strict consumer/audience binding and current purpose grants. Plain shared user authentication is insufficient.
2. Resolve account lifecycle, grant revision/revocation and Notes sync entitlement authoritatively on both checks. Add data-boundary atomic/session checks where required; do not promise immediate JWT revocation.
3. Use a read-only, owner-bound RLS session. Do not use a BYPASSRLS/service-role connection as a convenience. The explicit owner predicate is additional defense, not a replacement for RLS.
4. Inspect the actual deployed table/policies; this repository's historical migration does not reconstruct the full production schema. Test positive owner, other owner, missing purpose, lifecycle restriction and revocation against that deployment.
5. Measure EXPLAIN/read/CPU/egress at realistic scale. A suitable partial index on owner/recent active-note metadata may be needed; title matching can scan owner rows. SQL LIMIT bounds returned data, not database work. No index or migration is applied here.
6. Add reviewed runtime routing/CORS/rate limits and Hub token acquisition without exposing DB credentials. Complete Hub's real identity/device and deployed-artifact qualification, then change discovery/feature flags in a separate reviewed release.

This component fits the future trusted runtime; it does not select Cloudflare versus Vercel, create another identity project or replace ongoing platform work.

## Verification

`npm run typecheck` includes the server tree; `npm test` includes its tests. PGlite 0.5.8 is a pinned **dev dependency**, used for actual PostgreSQL query, JSON field, LIKE escaping, ordering, LIMIT and RLS fixture semantics. It is absent from the browser bundle. Fixture roles/policies/data are fictional and in memory; their passing tests do not certify hosted RLS or real token verification.

The owner tests cover SQL projection, active/Archive/Trash/tombstone/entity behavior, two owners, one-megabyte bodies, purpose/client/audience/revision/lifecycle/entitlement denial, revocation during reads, byte/item bounds, Unicode titles, errors, cancellation and deadline. Hub separately imports this actual component at a pinned commit and tests its envelopes through the existing validator/runner; it does not duplicate the projection in Hub.

Primary guidance reviewed 3 October 2026: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL pattern matching](https://www.postgresql.org/docs/current/functions-matching.html), [partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html). No hosted Supabase changes were made.
