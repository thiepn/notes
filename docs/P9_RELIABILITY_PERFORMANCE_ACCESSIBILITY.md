# P9 — Reliability, Performance & Accessibility Hardening

P9 is the final cross-cutting hardening phase before the P10 release audit. It does not add a new notebook subsystem. Instead it closes high-value runtime and interaction gaps that remain after P6 sync safety, P7 portability/recovery, and P8 privacy/security.

## Product goal

Notes should remain understandable and recoverable when part of the interface fails, should spend less browser work on large mobile libraries, and should expose the same workspace/list context to keyboard and assistive-technology users that sighted users receive.

P9 therefore strengthens four existing contracts:

1. **Runtime failure must not become a blank application.**
2. **Progressive rendering must adapt to the device class.**
3. **Progressive rendering must preserve complete list semantics.**
4. **The core local-first workflow must have a small cross-engine compatibility gate.**

## Application runtime recovery boundary

The React root is now wrapped in an application-level error boundary.

If a render or lazy module import fails, Notes replaces the broken React subtree with a minimal recovery screen containing:

- a clear `Notes couldn’t open` heading;
- an explicit statement that showing the recovery screen does not clear/reset browser-stored notes;
- a **Reload Notes** action;
- conservative recovery guidance that tells the user to leave browser data intact and use an existing backup or a working synced device if the failure persists.

The fallback deliberately does not display the caught exception, component stack, note text, attachment names, account data, or other potentially private runtime values.

The document title becomes `Recovery — Notes` while this surface is active.

### Boundary limits

React error boundaries catch render/lifecycle/lazy-import failures inside their subtree. They do not make arbitrary browser crashes, event-handler exceptions, storage corruption, or operating-system termination recoverable. Existing capture/editor journals, revision history, backup, sync, and IndexedDB safety remain the actual data-recovery layers.

P9 does not clear storage, reset the database, sign the user out, or perform automatic destructive repair when the boundary activates.

## Adaptive progressive note mounting

V4.0 introduced bounded progressive card mounting with a fixed 96-card initial window. P9 keeps that architecture but makes the first render responsive to the same shell breakpoints used elsewhere in Notes:

| Shell profile |        Width | Initial cards | Batch size | Observer preload margin |
| ------------- | -----------: | ------------: | ---------: | ----------------------: |
| Mobile        |   `<= 767px` |            48 |         48 |                   480px |
| Tablet        | `768–1100px` |            72 |         72 |                   640px |
| Desktop       |  `>= 1101px` |            96 |         96 |                   800px |

This reduces initial React nodes, ResizeObservers, attachment-preview observers, layout reads, and paint work on narrow devices without changing the logical collection or any bulk-operation semantics.

The visible **Show more notes** control remains the non-observer fallback. The full collection continues to live in application state; only rendered cards are bounded.

## Progressive-list accessibility

A progressively mounted list can visually represent only part of a much larger collection. P9 therefore gives each mounted masonry item:

- `aria-posinset` for its one-based logical position; and
- `aria-setsize` for the full current collection size.

A screen reader can therefore understand that the first 48 mobile-mounted cards belong to a 1,000-note result set instead of incorrectly inferring that the list contains only 48 items.

The existing list role/label and **Show more notes** control remain unchanged.

## ResizeObserver compatibility fallback

Masonry measurement previously instantiated `ResizeObserver` unconditionally in grid mode. P9 keeps responsive measurement where the API exists, but falls back to a one-time animation-frame measurement when `ResizeObserver` is unavailable.

The fallback preserves a usable grid instead of converting a missing optional browser API into an application-level render failure.

List mode continues to avoid masonry row-span measurement entirely.

## Workspace document context

Primary workspace navigation now updates both browser-level and assistive context:

- Notes -> `Notes`
- Search -> `Search — Notes`
- Reminders -> `Reminders — Notes`
- Archive -> `Archive — Notes`
- Trash -> `Trash — Notes`
- Backup -> `Backup — Notes`
- label view -> `<label name> — Notes`

A visually hidden polite status region exposes `<workspace> workspace` when the active workspace changes.

When privacy lock replaces the application UI, it owns the title as `Locked — Notes`. After unlock, the mounted workspace re-establishes its normal title.

This is navigation context, not a notification system. Note edits and search keystrokes do not rewrite the title or emit live-region messages.

## Cross-browser core certification

The full repository regression suite remains Chromium-only because it includes browser-specific media, OCR, PWA, and implementation-level checks. P9 adds a separate, intentionally small core compatibility suite that runs with retries disabled in:

- Chromium;
- Firefox; and
- WebKit.

The compatibility suite verifies the highest-value browser-independent behavior:

1. boot the local-first application;
2. create a text note;
3. persist it across reload;
4. reopen and edit it;
5. retrieve it through local search;
6. use the mobile navigation without horizontal overflow; and
7. receive correct document-title/workspace context while navigating.

This is a core compatibility gate, not a claim that every optional media API behaves identically in every browser engine.

## CI contract

P9 changes CI from installing only Chromium to installing Chromium, Firefox, and WebKit once. The release order is:

1. formatting;
2. foundation architecture contract;
3. lint;
4. TypeScript;
5. unit tests;
6. production build and performance budget;
7. core Chromium/Firefox/WebKit compatibility with retries disabled;
8. full Chromium regression suite;
9. production PWA/offline certification.

Compatibility screenshots/traces are retained with the existing browser diagnostics when a run fails.

## Persistence and architecture boundary

P9 requires no IndexedDB migration, backup-format change, Supabase schema change, RLS change, or account migration.

The runtime boundary and workspace announcement state are transient UI behavior. Mount-window profiles are rendering policy. `aria-posinset`/`aria-setsize` are derived DOM semantics. None become durable note data or sync records.

## Deliberate exclusions

P9 does not add:

- CRDT collaboration;
- server-side compare-and-swap sync;
- encrypted IndexedDB or encrypted backups;
- automatic database repair;
- remote telemetry or crash-report uploads;
- analytics SDKs;
- stored exception logs containing user content;
- full Firefox/WebKit certification for optional microphone, OCR, PWA install, or browser-notification behavior;
- a second rendering engine or separate mobile application.

Those are independent architectural/product decisions and are not required to close the current runtime/accessibility/performance gaps.

## Release invariants

P9 is releasable only if:

1. A lazy workspace/render failure surfaces the recovery UI instead of a blank root.
2. Activating the runtime boundary never clears the existing local note library.
3. The recovery surface exposes no caught exception or user-note content.
4. Mobile note grids begin at 48 mounted cards when automatic intersection loading is unavailable.
5. Tablet and desktop profiles retain 72/96 initial-card budgets respectively.
6. Manual **Show more notes** continues to advance by the profile batch size.
7. Mounted list items expose their logical position and the full collection size.
8. Grid rendering remains usable without `ResizeObserver`.
9. Workspace navigation updates document title and the polite assistive status region.
10. Privacy lock owns the locked document title without leaking note context.
11. Core compatibility passes directly in Chromium, Firefox, and WebKit with retries disabled.
12. Full Chromium regression and PWA/offline certification remain green.
13. Existing entry-bundle limits are not raised.
14. No IndexedDB or backend schema change is introduced.
