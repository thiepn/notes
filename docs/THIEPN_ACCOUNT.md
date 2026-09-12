# THIEPN Account

THIEPN Account is the shared first-party identity layer for supported apps hosted by THIEPN.

## Authoritative identity project

- Supabase project ref: `hycegznamzjhwinegaai`
- Project URL: `https://hycegznamzjhwinegaai.supabase.co`
- Browser auth storage key: `sb-hycegznamzjhwinegaai-auth-token`
- Production first-party origin: `https://thiepn.dev`

The browser client may contain only the Supabase publishable key. Secret/service-role keys must never be shipped to a frontend.

## Identity contract

1. One `auth.users.id` UUID is the canonical user identity across supported apps.
2. Email/password and Google are authentication methods for that same identity, not separate app accounts.
3. Apps must never create a second user database for first-party identity.
4. App data belongs to `auth.uid()` and must be protected by Row Level Security.
5. Authentication does not automatically grant access to another user's app data.
6. App-specific rows should be created lazily when the user uses that app. Do not create every app's profile/data for every new auth user.
7. Authorization must use trusted server/app metadata or database ownership, never user-editable `user_metadata`.

## Shared browser session

First-party apps under `https://thiepn.dev/...` use Supabase's project-scoped storage key:

```text
sb-hycegznamzjhwinegaai-auth-token
```

This allows a valid THIEPN Account session created by one supported app to be discovered by another supported app on the same origin.

Legacy app-specific session keys may be promoted only when they were issued by this exact Supabase project. Tokens from another Supabase project must never be copied into the shared key.

Signing out of the shared session signs the user out of supported THIEPN apps in that browser. App-local offline data is governed by each app's own data-retention rules.

## Adding a new first-party app

A new app that needs accounts should:

1. Use project `hycegznamzjhwinegaai` rather than creating another Auth project.
2. Use the project's publishable key in the browser.
3. Persist Supabase Auth under `sb-hycegznamzjhwinegaai-auth-token`.
4. Support the authentication methods appropriate for its UX (email/password, Google, or both).
5. Use the authenticated UUID as the owner key on all private app data.
6. Enable RLS on every exposed table and scope policies with `(select auth.uid()) = user_id` (or an equivalent ownership relation).
7. Give `UPDATE` policies both `USING` and `WITH CHECK` clauses when client writes are allowed.
8. Avoid generic cross-app table names when a new domain could collide; prefer app-specific names or a deliberate schema boundary.
9. Never expose service-role/secret credentials to the frontend.
10. Test with at least two distinct authenticated users and prove that user B cannot read user A's data.

## Current adoption

- **Notes:** shared identity project; email/password account flows; cloud Notes access remains separately authorized and RLS-protected.
- **WORDSTRIKE:** shared identity project; Google auth and leaderboard identity; legacy same-project session migrates to the shared key.
- **Diet Copilot:** migrated to the shared identity project; existing Diet data was remapped to its matching canonical THIEPN user UUID; Google/email/password entry points use the shared session.
- **Clean30:** remains local-only until account-backed persistence is required. When added, it should follow this contract rather than create a new Auth project.

## Production email requirements

For public email/password signup, configure the Supabase Email provider, allowed redirect URLs for the first-party apps, custom SMTP, and leaked-password protection in the Supabase dashboard. Keep email confirmation enabled for public signups unless there is a deliberate security review approving another flow.
