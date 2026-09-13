# P21 — Post-V1 Product Quality & Daily-Use Polish

## Goal

P21 is the first post-v1 hardening pass. It improves frequent interaction details discovered after the P1–P20 release sequence without adding a new product system, storage model, or navigation architecture.

Baseline main SHA: `5889ed9d8ff476652496e83ebc1c9f450668482e`.

The phase concentrates on small sources of repeated friction: capture-tool keyboard behavior, mixed-popover semantics, redundant search chrome, accessible filter state, and clarity around the shared THIEPN Account session introduced after v1.0.

## Audit findings and fixes

### 1. Quick capture menu keyboard model

The collapsed composer already exposed **More capture options** visually as a menu, but it did not provide the complete keyboard behavior used by the header and note-card menus.

P21 makes it a real menu-button interaction:

- `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls` connect the trigger and menu;
- `ArrowDown` opens at the first item;
- `ArrowUp` opens at the last item;
- `ArrowDown` / `ArrowUp` wrap through enabled items;
- `Home` / `End` move to the first / last item;
- `Escape` closes the menu and restores focus to the trigger;
- focus leaving the control closes the transient menu;
- pointer interaction outside the control also dismisses it.

The capture choices and behavior themselves are unchanged.

### 2. Expanded Add surface uses the correct interaction model

The expanded composer's **Add** surface is not semantically a simple menu. In addition to ordinary buttons it can contain lazy-loaded drawing and voice controls and an OCR surface with its own controls.

Treating that mixed content as a `menu` would give assistive technology the wrong model.

P21 therefore exposes **Add** as a focus-managed non-modal dialog/popover:

- the trigger uses `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`;
- focus enters the first available control when the surface opens;
- `Escape` closes the surface and returns focus to Add;
- outside pointer/focus movement dismisses it;
- nested drawing, voice, and OCR dialogs keep their existing behavior.

This preserves the existing tools while making the semantics match the actual content.

### 3. Search chrome is less redundant

A query-only search previously showed both:

- the inline **Clear search query** control; and
- a second **Reset** control that performed effectively the same cleanup in that state.

P21 keeps the inline clear action for query-only searches and reserves **Reset** for searches with active filters, where a full reset has distinct meaning.

The filter trigger now also exposes the active filter count in its accessible name, for example `Search filters, 2 active`, while retaining the existing visual badge.

No search parsing, ranking, indexing, suggestions, saved-search persistence, or filter semantics change.

### 4. THIEPN Account state is explained accurately

After the post-v1 shared-account migration, Notes uses the shared THIEPN Account browser session while Notes data authorization remains app-specific.

P21 updates Account & sync copy so the interface no longer reads like a Notes-only identity system:

- signed-out entry is labeled **THIEPN Account**;
- cross-device copy distinguishes shared sign-in from the separately authorized Notes library;
- account credential copy states that credentials belong to the shared first-party identity;
- session copy explains that supported apps on the same origin share the browser account session;
- sign-out copy warns that signing out can affect other supported THIEPN apps in that browser;
- account-deletion copy no longer hard-codes WORDSTRIKE as the only possible shared-identity blocker.

No authentication, token-storage, RLS, sync, session-revocation, or account-deletion behavior changes.

### 5. Async account actions expose working state

Account & sync actions already disabled controls while work was in progress, but the state was not explicitly announced.

P21 adds a polite `Working…` status and `aria-busy` state to the relevant settings groups. This is presentation/interaction feedback only; network behavior is unchanged.

## Permanent regression coverage

`e2e/p21-post-v1-daily-use-polish.spec.ts` verifies:

1. complete keyboard traversal and focus restoration for the quick capture menu;
2. correct dialog semantics, initial focus, Escape dismissal, and focus return for the expanded Add popover;
3. query-only search no longer renders redundant Reset chrome and active filter counts are announced;
4. Account & sync describes the shared THIEPN Account boundary in the signed-out state.

The complete existing P1–P20 browser suites remain part of the normal release gate.

## Preserved boundaries

P21 intentionally makes no changes to:

- IndexedDB schema/version or persisted note/checklist/label/attachment formats;
- repository persistence or revision/history semantics;
- sync entity formats, conflict handling, RLS, Supabase project, or auth storage key;
- backup/import/export formats;
- search engine scoring, tokenization, indexing, or worker protocol;
- reminder scheduling or notification persistence;
- privacy-lock cryptography/storage;
- PWA service worker, install, share-target, or offline transport;
- note types, product navigation hierarchy, or visual design system.

## Certification

P21 is complete only when the exact branch head passes the repository's formatting, foundation/release contracts, lint, TypeScript, unit, build/performance, cross-browser core, full no-retry Chromium E2E, P20 composition, and PWA/offline gates.
