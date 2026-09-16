# P33 — Settings & Global Interaction Completion

## Goal

P33 closes the remaining cross-feature interaction inconsistencies before the final hardening phase. It does not add product features or change Notes persistence, sync, privacy, backup, reminder, search, or PWA architecture.

The phase concentrates on interaction behavior shared across Settings and modal surfaces: deterministic focus, keyboard section navigation, safe transition between surfaces, mobile visibility, and accessible completion feedback.

## Settings hierarchy and keyboard navigation

The existing six Settings sections remain unchanged:

- Appearance
- Account & sync
- Privacy
- Notifications
- Search & history
- Data & advanced

P33 keeps ordinary button semantics and adds consistent directional navigation across the section rail:

- ArrowRight / ArrowDown moves to the next section;
- ArrowLeft / ArrowUp moves to the previous section;
- Home moves to Appearance;
- End moves to Data & advanced;
- navigation wraps at either end.

Keyboard navigation both changes the active section and moves focus to the corresponding section control.

Each navigation control now exposes `aria-controls` for its active content region. The visible Settings content is an explicitly labelled region tied to its section heading.

On narrow mobile layouts the newly active navigation item is scrolled into view with nearest-edge behavior. This keeps keyboard-selected sections visible in the horizontally scrollable Settings rail without forcing unrelated page movement.

## Settings transition focus

### Privacy lock

Opening Privacy-lock management intentionally replaces the main Settings dialog with the dedicated Privacy Settings dialog. When Privacy Settings closes, Settings remounts on the Privacy section.

P33 now makes that return deterministic: the originating **Set up privacy lock** / **Manage passcode** control receives initial focus rather than returning users to the Settings Close button.

Normal Settings entry points still focus the safe Close control first.

### Backup & import

Opening Backup & import from Settings closes the modal and changes the main workspace. P33 explicitly moves focus to `#main-content` after that transition so keyboard and assistive-technology users arrive at the newly selected destination instead of retaining focus on a removed Settings button.

## Search-history completion feedback

Clearing recent search history disables the action immediately because no recent entries remain. Previously that could leave keyboard focus on a control that had just become disabled with no explicit completion target.

P33 adds a focusable status message:

> Recent search history cleared. Saved searches were kept.

The status receives focus after the action, announces completion, and reiterates that saved searches were not deleted.

## Shared nested-modal focus restoration

`useDialogFocusTrap` already restored focus conservatively when an ordinary modal closed. Its old rule skipped restoration whenever any other modal remained visible.

That was too conservative for true stacked-dialog flows: if the original trigger belongs to the newly revealed topmost modal, returning focus to it is correct and expected.

P33 refines the shared rule:

1. closing surfaces still restore only when focus is unclaimed or remains inside the closing surface;
2. if no modal remains, the existing restoration behavior is preserved;
3. if a modal remains, focus is restored only when the previous element belongs to that topmost remaining modal;
4. disconnected, inert, or `aria-hidden` targets are never focused.

This prevents a closing child modal from stealing focus into the page behind another modal while allowing legitimate nested-modal restoration.

## Permanent regression coverage

`e2e/p33-settings-global-interaction-completion.spec.ts` verifies:

- directional, Home, and End navigation between Settings sections;
- active mobile Settings navigation remains in the viewport;
- active content regions track keyboard section changes;
- clearing recent history focuses explicit completion feedback;
- closing Privacy-lock management returns focus to the originating Settings control;
- opening Backup from Settings closes the modal and focuses the destination workspace.

Run the focused suite with:

```sh
npm run e2e:p33
```

The complete release suite remains the merge authority.

## Preserved boundaries

P33 makes no changes to:

- IndexedDB schema or record formats;
- note/checklist/attachment/reminder/revision persistence;
- sync protocol, conflict resolution, or account API behavior;
- privacy credential format, PBKDF2 parameters, lock storage, or threat model;
- backup/archive/import formats;
- search ranking/indexing or saved-search persistence;
- reminder scheduling or notification delivery;
- PWA service-worker/offline architecture;
- product navigation destinations;
- visual theme system.

P33 is the last interaction-completion phase. P34 is reserved for final hardening, full audit, release certification, and shipping readiness rather than further generic feature expansion.
