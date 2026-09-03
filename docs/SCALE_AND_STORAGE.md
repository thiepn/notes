# Scale, Storage & Architecture Hardening — V3.9

## Goals

V3.9 adds no major end-user capability. It hardens the existing local-first product against larger libraries, browser storage eviction, brittle global UI coordination, and modal accessibility regressions.

## Attachment-aware search without Blob scans

Attachment records continue to store their Blob payload in IndexedDB. Database v3 adds two metadata compound indexes:

- `[noteId+name]`
- `[noteId+mimeType]`

Search uses index-key cursors for attachment filenames and image-presence detection. It therefore does not call `attachments.toArray()` while constructing the search document index. A production performance gate fails if that full-row scan is reintroduced.

## Storage durability

Settings → Data & advanced exposes browser storage health where supported:

- persistent vs best-effort retention;
- estimated usage;
- estimated quota;
- an explicit request for persistent storage when the browser supports it.

This is advisory browser state. Persistent storage reduces automatic eviction risk but cannot prevent a user/browser-admin from explicitly clearing site data. Full backup remains mandatory disaster recovery.

## Large-library regression budget

The unit suite contains a deterministic 10,000-note fuzzy-search budget. The existing production entry-JS and PWA/OCR precache budgets remain release gates. Browser E2E also verifies that attachment search works when `attachments.toArray()` is deliberately disabled at runtime.

## UI architecture

The following global interactions are coordinated explicitly through React state/props:

- text/checklist capture requests;
- search focus requests;
- grid/list view preference.

This removes reliance on querying another component by ARIA label and programmatically clicking it. DOM traversal remains limited to interactions whose semantic target is inherently the currently focused note card.

## Dialog accessibility

Settings, privacy settings, label management, and the command palette share one focus-containment utility. It cycles Tab within the active dialog, supports initial focus and restoration, and centralizes Escape handling for dialogs that delegate Escape to the hook.
