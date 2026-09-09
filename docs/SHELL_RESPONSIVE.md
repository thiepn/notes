# P2 — Application Shell, Navigation & Responsive UX

## Contract

Notes has three deliberate shell modes. Responsive behavior is a product contract rather than a collection of incidental media-query fixes.

### Desktop — 1101px and wider

- The left navigation is persistent and starts expanded.
- Users may collapse it to an icon rail; this preference persists under `notes.shell.sidebar`.
- Search remains a first-class header control.
- Command palette, Settings, and More are directly reachable from the header.
- Notes, Search, Reminders, Archive, Trash, Labels, Backup & import, Settings, Commands, and account/sync status are reachable without opening a mobile-only surface.

### Tablet — 768px through 1100px

- The sidebar becomes a compact touch-safe rail automatically, independent of the stored desktop preference.
- The navigation toggle temporarily expands the rail; choosing a destination collapses it again.
- Search remains full-width within the available header track.
- Header density is reduced: Command and Settings move behind More/sidebar while remaining keyboard and touch reachable.
- Tablet controls must not depend on hover.

### Mobile — 767px and narrower

- Primary navigation is a fixed five-destination bar: Notes, Search, New, Reminders, More.
- More opens a full-height focus-trapped navigation drawer; desktop header navigation/actions are not duplicated on screen.
- Secondary destinations live in the drawer: labels, Archive, Trash, Backup & import, Settings, Commands, and account/sync.
- Safe-area insets are respected at the drawer and bottom navigation.
- Main content receives bottom clearance for the fixed navigation bar.
- Important touch controls are at least 44px high.

## Breakpoint ownership

Breakpoint boundaries live in `src/app/shellLayout.ts` and are regression-tested at their exact edges. CSS mirrors the same boundaries: mobile max 767px, tablet max 1100px, desktop from 1101px.

## State ownership

`AppShell` owns viewport mode, desktop sidebar preference, tablet temporary expansion, and mobile drawer state. `AppSidebar` renders navigation but does not invent responsive state. Desktop preference is the only sidebar state persisted; mobile/tablet state is transient.

## Accessibility

- The mobile drawer is modal and inert while closed.
- Escape dismisses open mobile/tablet navigation surfaces.
- Navigation items use `aria-current` for the active destination.
- Search is a first-class destination and can be reached from desktop sidebar, mobile bottom navigation, `/`, or the command palette.
- The mobile bottom bar and tablet rail remain fully usable without hover.

## Release gate

P2 browser coverage checks 15 widths from 320px through 1920px, exact breakpoint behavior, persistent desktop preference, tablet expansion/collapse, mobile one-handed navigation, direct Settings access, touch target sizing, horizontal overflow, and header collision geometry. Existing P1 data-preservation and the full Chromium/PWA suites remain mandatory.
