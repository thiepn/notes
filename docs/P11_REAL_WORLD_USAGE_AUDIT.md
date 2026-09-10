# P11 — Real-World Usage Audit

P11 is a post-P10 usability hardening pass. Its purpose is to reduce friction discovered by reading the product as a daily-use application rather than adding another layer of features.

## Audit principle

The P1–P10 product surface is treated as the baseline. P11 only changes presentation or navigation where the existing interface contradicts its own interaction model, repeats information, hides important destinations, or exposes desktop-only guidance on touch layouts.

## Findings and fixes

### 1. Mobile More drawer repeated primary navigation

The fixed mobile bottom navigation already owns Notes, Search, New, and Reminders, but the drawer opened by More repeated New note, Notes, Search, and Reminders before secondary destinations.

P11 makes that contract explicit:

- the bottom bar remains the mobile primary navigation;
- the drawer is titled **More**;
- the drawer begins with Labels and continues with Archive, Trash, Backup & import, Settings, Commands, and sync status;
- desktop and tablet sidebar navigation remains unchanged;
- mobile label search remains available for larger label collections;
- desktop keyboard shortcut text is not shown inside the mobile drawer.

### 2. Larger layouts displayed sync status twice

Account/sync status appeared both in the workspace heading and in the persistent sidebar footer on desktop/tablet.

P11 keeps one visible status affordance per layout:

- desktop/tablet use the persistent sidebar sync control;
- mobile keeps a compact, icon-only sync control in the workspace heading;
- the control retains its accessible name and tooltip, so removing visible text does not remove the status or Settings entry point.

### 3. Mobile workspace chrome delayed the primary task

The mobile workspace showed a kicker, large collection title, descriptive paragraph, and full sync-status text below a two-row application header before the capture surface or notes appeared.

P11 keeps the collection title but removes redundant explanatory chrome on small screens. The heading becomes a compact title/status row so capture and note content appear substantially higher in the viewport.

### 4. Mobile Settings hid sections behind horizontal scrolling

Settings contains six top-level destinations. On mobile they were presented in a horizontal, scrollable strip, so several destinations could exist off-screen with no strong indication that more sections were available.

P11 changes the mobile Settings index to a two-column grid. All six sections are visible together without horizontal tab scrolling while the desktop Settings layout is unchanged.

### 5. Touch capture showed desktop-only shortcut instructions

The mobile capture sheet displayed `C` and `Shift+C` keyboard guidance even though its primary environment is touch.

P11 hides that shortcut hint on mobile while retaining it on larger keyboard-oriented layouts.

## Preserved product boundaries

P11 deliberately does **not** change:

- IndexedDB schema or migrations;
- repository persistence semantics;
- Supabase schema, RLS, account authentication, or sync protocol;
- conflict preservation behavior;
- backup/export/import formats;
- privacy lock or privacy preferences;
- PWA install/offline/share-target behavior;
- search ranking or indexing;
- note editor save semantics;
- note, checklist, reminder, attachment, drawing, OCR, voice, history, or connection data models.

## Regression coverage

`e2e/p11-real-world-usage.spec.ts` protects the P11 contracts:

1. the mobile More drawer contains secondary destinations and no duplicate primary actions;
2. mobile workspace chrome stays compact while sync remains accessible;
3. desktop exposes a single visible sync affordance;
4. all mobile Settings sections are visible without horizontal scrolling;
5. the touch capture sheet omits desktop-only shortcut copy.

The complete repository release gate remains authoritative: formatting, foundation contract, lint, TypeScript, unit tests, production build/performance budget, compatibility checks, Chromium E2E, and PWA/offline coverage must still pass before P11 can merge.
