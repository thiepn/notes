# P22 — Mobile/PWA Experience 2.0

## Goal

P22 hardens the installed and mobile-browser experience without changing Notes' product model, storage model, sync protocol, or navigation architecture.

Baseline main SHA: `6a200604f122dc0d82534a09126ca8e2fea835b1` (P21 merge).

The phase concentrates on the remaining mobile/PWA friction after the release baseline: safe-area handling around installed-app chrome, consistent clearance above the fixed mobile navigation, and browser install/update handoffs that previously had weak failure feedback.

## Audit findings and fixes

### 1. Mobile safe areas are applied consistently

`viewport-fit=cover` allows Notes to use the full installed-app viewport, but the mobile header previously did not reserve the top device inset and several horizontal surfaces relied on fixed edge padding.

P22 adds one mobile safe-area contract for:

- the sticky header and its effective height;
- workspace left/right/bottom padding;
- the mobile navigation's horizontal edges;
- the mobile drawer;
- full-screen note editing;
- the capture dialog layer.

With zero browser/device insets, the existing layout dimensions are preserved.

### 2. Bottom navigation clearance has one source of truth

The workspace, lifecycle toast, and PWA status surface previously used separate hard-coded offsets above the fixed mobile navigation.

P22 introduces shared mobile CSS tokens for the navigation bar height and bottom clearance. PWA notices and lifecycle notices now consume the same clearance contract as the workspace, including `safe-area-inset-bottom`.

This is a layout-only change. Navigation destinations and behavior are unchanged.

### 3. Install dismissal respects the current browser session

A user who dismissed the browser-provided **Install Notes** prompt could see the same prompt again after every reload because dismissal existed only in React state.

P22 remembers that dismissal in `sessionStorage`:

- dismissal remains respected across reloads in the same tab/browser session;
- no long-term install preference is stored;
- a later browser session can offer installation again;
- a successful `appinstalled` event clears the temporary dismissal marker.

This does not change the web app manifest or installation eligibility.

### 4. Browser install failures no longer disappear silently

If the browser's install handoff throws, Notes now surfaces an **Install unavailable** status with a browser-menu fallback instead of simply removing the prompt.

The failure does not set the dismissal marker, so a later valid install prompt can still be used.

### 5. Service-worker update failures remain actionable

The update notice now exposes busy state while the service-worker updater runs. If applying the update fails, the notice stays visible as **Update interrupted** and offers a retry rather than disappearing.

No service-worker caching or update strategy changes were made.

## Permanent regression coverage

`e2e/p22-mobile-pwa-experience.spec.ts` verifies:

1. install dismissal survives a reload within the same browser session;
2. a failed install handoff exposes fallback guidance without suppressing a later retry;
3. mobile PWA status remains above the fixed bottom navigation, workspace content retains bottom clearance, and no horizontal overflow is introduced.

Run the focused contract with:

```bash
npm run e2e:p22
```

The normal full Chromium release suite also discovers the P22 spec automatically.

## Preserved boundaries

P22 intentionally does not change:

- IndexedDB schema/version or persisted note/checklist/label/attachment formats;
- revision/history or repository persistence semantics;
- THIEPN Account identity, Notes cloud authorization, sync payloads, RLS, or conflict handling;
- backup/import/export formats;
- search indexing, scoring, parsing, history, or saved-search formats;
- reminder scheduling or notification persistence;
- privacy-lock storage or cryptography;
- the web app manifest's identity, scope, start URL, display mode, or icons;
- service-worker caching strategy or offline data model;
- note types or primary navigation destinations.

## Certification

P22 is complete only when its exact branch head passes formatting, foundation/release contracts, lint, TypeScript, unit tests, build/performance budget, core browser compatibility, the complete no-retry Chromium release regression suite, the focused P22 suite, P20 composition certification, and PWA/offline certification.
