# V4.2 — Interaction Consistency & Accessibility Hardening

V4.2 hardens the existing Notes interaction model without adding product features or changing the V4.0 large-library architecture and V4.1 visual system.

## Scope

The phase concentrates on four recurring interaction contracts:

1. Keyboard-operated menus behave like menus rather than generic popovers.
2. Dialog focus containment ignores hidden, inert, and explicitly untabbable controls and does not steal focus from a newly opened surface during restoration.
3. Composite widgets expose the same active state to assistive technology that sighted users see.
4. Reduced-motion and forced-colors preferences retain visible focus, selection, and active-state affordances.

## Header menu contract

The global More menu supports:

- `ArrowDown` from the trigger to open and focus the first enabled item;
- `ArrowUp` from the trigger to open and focus the last enabled item;
- `ArrowDown` / `ArrowUp` wrapping through enabled menu items;
- `Home` / `End` to jump to the first / last item;
- `Escape` to close the menu and restore focus to the More trigger;
- normal pointer dismissal and normal Tab movement out of the menu.

The trigger exposes `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`.

## Dialog focus contract

`useDialogFocusTrap` is the shared dialog focus boundary.

- Initial focus uses `preventScroll`.
- Tab and Shift+Tab wrap only through controls that are actually tabbable.
- Descendants of `inert` or `aria-hidden="true"` containers are excluded.
- Explicit negative `tabindex` is respected even when the underlying element is normally focusable.
- Escape remains available to dialogs that opt into the shared `onEscape` behavior.
- On close, prior focus is restored only when focus is otherwise unclaimed, preventing a closing dialog from stealing focus from a newly opened surface.

## Command palette contract

The command palette remains a dialog containing a combobox/listbox composite.

- DOM focus remains in the search combobox while arrow keys move the active command.
- `aria-activedescendant` identifies the same command that receives the visual active state.
- Options have stable IDs and `aria-selected` state.
- Disabled commands are skipped by keyboard navigation.
- `Home`, `End`, `ArrowUp`, and `ArrowDown` operate on enabled commands only.
- Escape is handled through the shared dialog focus utility.

## User preference hardening

### Reduced motion

When `prefers-reduced-motion: reduce` is active, interaction state may still change instantly, but decorative translation/scaling of primary shell/card/navigation controls is removed.

### Forced colors / high contrast

When `forced-colors: active` is active:

- keyboard focus receives a system `Highlight` outline;
- selected cards retain a visible system-color boundary;
- selected note toggles use `Highlight` / `HighlightText`;
- active filter/count surfaces remain distinguishable using system colors;
- native checkbox/radio rendering remains available to the operating system.

## Regression requirements

Permanent browser coverage verifies:

- complete keyboard navigation and focus restoration for the header More menu;
- command-palette `aria-activedescendant` synchronization;
- command-palette focus staying in the combobox composite;
- Settings focus containment;
- reduced-motion card behavior;
- forced-colors focus visibility.

All existing format, lint, TypeScript, unit, production-build/performance, full Chromium E2E, and PWA/offline gates remain release blockers.
