# P19 — Accessibility & Interaction Quality

## Goal

P19 hardens the existing interaction model for keyboard, assistive-technology, reduced-input, and mobile users without redesigning Notes or adding a second interaction architecture.

The phase builds on the existing V4.2 accessibility foundation: shared modal focus containment, keyboard-aware header menus, command-palette active-descendant semantics, reduced-motion behavior, forced-colors support, workspace announcements, and the skip-to-main-content path remain intact.

## Improvements

### Dialog focus restoration

`useDialogFocusTrap` now restores focus when a modal closes while focus is still physically inside that closing surface, not only when the browser has already moved focus to `body`.

The restoration remains conservative: if another visible `aria-modal` surface has opened, the closing dialog does not steal focus from it.

This specifically strengthens persistent-but-inert surfaces such as the mobile navigation dialog as well as ordinary unmounted dialogs.

### Destructive confirmations

Permanent-delete confirmation now uses the shared dialog contract for:

- Escape handling;
- initial focus on the safe Cancel action;
- focus restoration after close.

The separate global Escape listener and `autoFocus` path are no longer required.

### Note-card action menu

Each note card's **More actions** surface now follows the same menu-button keyboard model as the global header menu:

- `ArrowDown` opens and focuses the first enabled item;
- `ArrowUp` opens and focuses the last enabled item;
- `ArrowDown` / `ArrowUp` wrap;
- `Home` / `End` move to the first / last item;
- `Escape` closes the menu and returns focus to the trigger;
- the trigger exposes `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`;
- the menu receives a note-specific accessible label.

### Note organization popovers

Color and label popovers now have stable IDs connected to their triggers through `aria-controls` and `aria-haspopup="dialog"`.

When opened, keyboard focus moves into the popover. Escape closes the popover and returns focus to the originating control. If a color is chosen and the card remains present, focus returns to the origin after the mutation.

Empty organization popovers remain programmatically focusable so the dialog itself can receive focus when there is no child control.

### Bulk-selection interaction

Bulk Color and Labels popovers now:

- expose `aria-haspopup="dialog"` and `aria-controls` from their triggers;
- move focus to their first available control when opened;
- close on Escape and restore focus to the correct toolbar trigger.

Selection count changes are announced through a polite live region.

Bulk label membership now exposes the real tri-state state to assistive technology: labels assigned to only some selected notes use `aria-pressed="mixed"` instead of presenting the state as simply false.

### Capture subpanels

The Capture Everywhere Web Link and Templates subpanels now have deterministic focus transitions:

- Web Link moves focus directly into the URL field;
- Templates moves focus to Back;
- Back returns focus to the newly mounted originating Web Link or Template control rather than a stale DOM node;
- URL validation exposes `aria-invalid` and `aria-describedby` while retaining the existing live `role="alert"` error.

The capture dialog also exposes `aria-busy` during asynchronous capture work, and quick-start icons are presentation-only to avoid duplicate accessible names.

## Permanent regression coverage

P19 browser coverage verifies:

- complete note-card More-menu keyboard navigation and focus restoration;
- note Color popover focus entry and Escape restoration;
- bulk-selection live status, mixed ARIA label state, and popover focus return;
- Capture Templates/Web Link focus transitions and accessible URL validation;
- mobile navigation initial focus and focus restoration after Escape.

The existing V4.2 interaction tests continue to certify the header menu, command palette, Settings focus containment, reduced motion, and forced-colors behavior.

## Preserved boundaries

P19 makes no changes to:

- IndexedDB schema/version or persisted record formats;
- sync, conflict, or backup formats;
- search ranking/indexing;
- note content/editor persistence behavior;
- privacy-lock cryptography or storage;
- reminder scheduling;
- PWA service-worker transport;
- visual design system or product navigation architecture.
