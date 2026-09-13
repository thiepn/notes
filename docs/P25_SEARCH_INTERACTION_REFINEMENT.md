# P25 — Search Interaction Refinement

## Goal

P25 refines the interaction layer around the existing local search engine without changing indexing, ranking, query syntax, saved-search persistence, or result data.

Production baseline: `844ab1fd94dd9058b30a3383c8ca040d935ab1ff` (P24 production deployment).

The phase focuses on two high-frequency search surfaces that still behaved less predictably than the rest of the app: the filter sheet and search-assist history/suggestions.

## Audit findings and fixes

### 1. Search filters now expose dialog semantics

The filter surface was visually a sheet/panel but was exposed only as a labeled region. P25 exposes it as a **Search filters** dialog.

Desktop keeps the panel non-modal and inline. Mobile keeps the existing fixed bottom-sheet presentation and additionally exposes `aria-modal="true"`.

No filter options or filtering semantics are changed.

### 2. Mobile filter sheets now use the app's focus-trap contract

At widths matching the existing mobile filter breakpoint, the panel now uses the shared dialog focus utility:

- focus enters the sheet when it opens;
- Tab/Shift+Tab remain within the mobile sheet;
- Escape closes the sheet locally;
- closing restores focus to the Search filters trigger.

Desktop does not become focus-trapped. It receives deterministic initial focus on the sheet's Close control and supports local Escape dismissal.

### 3. Filter dismissal restores a stable keyboard position

Whether the filter surface closes from its Close button, Escape, or the existing mobile backdrop path, unmounting the filter surface returns focus to the Search filters trigger when that trigger is still present.

This prevents focus from falling back to the document body after the surface disappears.

### 4. Search assist adds Home/End navigation

The existing search assist already supports ArrowUp/ArrowDown and Escape. P25 adds:

- Home — focus the first navigable suggestion/history item;
- End — focus the last navigable suggestion/history item.

The existing search query parser, suggestions, history filtering, and Arrow-key behavior are unchanged.

### 5. Search-history destructive actions preserve focus

Removing a saved search or clearing recent search history can remove the button that currently owns focus. P25 explicitly returns focus to the Search notes field after those actions.

This is transient interaction state only; saved and recent search persistence rules are unchanged.

## Permanent regression coverage

`e2e/p25-search-interaction-refinement.spec.ts` verifies:

1. desktop filter-dialog initial focus, Escape dismissal, and trigger restoration;
2. mobile modal semantics and focus trapping;
3. mobile Escape dismissal and trigger restoration;
4. Home/End navigation in search assist;
5. Escape returning from search assist to the search field;
6. saved-search removal preserving a usable focus position.

The existing retrieval regression is updated to expect Search filters as a dialog instead of a region.

Run the focused contract with:

```bash
npm run e2e:p25
```

The normal full Chromium release regression also discovers P25 automatically.

## Preserved boundaries

P25 intentionally does not change:

- IndexedDB schema/version;
- note/checklist/attachment/label/reminder record formats;
- search tokenization, fuzzy matching, scoring, or ranking;
- search worker protocol;
- query operators or parser rules;
- saved-search or recent-search storage formats;
- filter meaning or result inclusion rules;
- note editing, autosave, recovery, or revision behavior;
- account authentication, sync payloads, RLS, or conflict handling;
- backup/import/export formats;
- PWA manifest, service worker, or offline data model;
- primary navigation.

No migration is required.

## Certification

P25 is complete only when its exact branch head passes formatting, foundation/release contracts, lint, TypeScript, unit tests, build/performance budget, three-engine browser compatibility, the complete Chromium release suite with retries disabled, P20 composition certification, and PWA/offline certification.
