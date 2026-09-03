# Design System — V4.1

V4.1 defines the current visual and interaction contract for Notes. Later phases should extend this system rather than adding another competing polish layer or feature-specific theme vocabulary.

## Product direction

The interface is content-led, quiet, and local-first. Application chrome should recede so capture, reading, search, and note content carry the hierarchy. The intended character is restrained rather than decorative: soft neutral surfaces, tonal note colors, modest elevation, strong typography, progressive disclosure, and short motion.

The visual system should feel equally intentional in light and dark mode. Dark mode is not an inversion of the light palette, and note colors are not saturated status colors; both are designed semantic surfaces.

## CSS structure

- `src/styles/tokens.css` — semantic colors, typography scale, spacing, radii, elevation, motion, layout dimensions, z-index layers, and light/dark note surfaces.
- `src/styles/base.css` — document reset, typography defaults, focus behavior, selection, and reduced-motion handling.
- `src/styles/shell.css` — structural shell behavior for header, search, sidebar, workspace, and responsive navigation.
- feature-specific styles — behavior and layout owned by each feature.
- `src/styles/visual-system-polish.css` — the final V4.1 visual layer. It may refine presentation, but must not hide required capability or change data behavior.
- `src/styles.css` — stable import entry point. `visual-system-polish.css` is intentionally last.

## Theme contract

Supported appearance preferences remain `system`, `light`, and `dark`.

- The preference is stored locally under `notes.theme`.
- `system` follows `prefers-color-scheme` live.
- Initial appearance is resolved before React mounts to avoid a light/dark flash.
- Light mode uses an off-white application background with clean elevated surfaces rather than white-on-white boxes separated by heavy borders.
- Dark mode uses layered charcoal surfaces rather than pure black.
- Dark text colors are off-white instead of full white.
- Every note color has a deliberately muted light and dark surface.
- Accent color is reserved for state, focus, selection, and primary interactive emphasis rather than general decoration.

## Elevation and borders

Use elevation to communicate interaction or layering, not to decorate every surface.

1. Note cards have a subtle border and near-flat resting shadow.
2. Hover/focus may raise a card by at most 1px and introduce modest elevation.
3. Dialogs and floating menus use the raised-surface vocabulary and stronger shadow.
4. Navigation rows and Settings rows generally use background contrast instead of boxed borders.
5. Border contrast should be lower in dark mode than content contrast.

## Shape vocabulary

Rounding is deliberate rather than universal.

- small controls: 8px;
- normal controls/rows: 10–12px;
- cards: about 15px desktop, slightly tighter on mobile;
- dialogs: 20px desktop;
- pills: only chips, counters, switches, and genuinely pill-shaped controls.

## Typography hierarchy

- Workspace titles provide orientation but must not dominate the notes themselves.
- Note titles use moderate semibold weight and compact tracking.
- Note bodies favor readability with roughly 1.55–1.6 line height.
- Metadata, counts, labels, and section headings are tertiary and use muted color.
- Avoid bold text when hierarchy can be communicated through spacing, size, or placement.

## Header and search

- Header height remains 64px.
- Search is the dominant central control on desktop.
- Header background blends with the application background and uses only a subtle lower separator.
- Search gains a raised surface and a clear focus ring without becoming a large bordered panel.
- Secondary global actions remain in the More menu/command palette.
- Mobile keeps the header compact and lets search consume the available center width.

## Sidebar

- Desktop: 272px expanded, 80px compact.
- Medium: automatic 80px icon rail.
- Mobile: off-canvas drawer with backdrop and Escape dismissal.
- Navigation items use compact rounded rows, not large pills.
- Counts are quiet tabular text, not badges.
- Section separators rely primarily on spacing rather than horizontal rules.
- The local-first footer is informational, not a card.

## Note cards

Note cards are the core visual object.

- Resting cards are almost flat with low-contrast borders.
- Note color is tonal and remains comfortable in dense libraries.
- Title, body, attachments/checklist content, and metadata form a clear descending hierarchy.
- Desktop actions appear on hover/focus or when a panel is open.
- Touch cards expose a single quiet overflow path; direct secondary actions are not permanently displayed.
- Selected cards use accent outline/elevation and enter a distinct bulk-selection mode.
- V4.0 progressive mounting remains invisible to normal use; the optional Show more control is tertiary.

## Settings

Settings uses a native row-based information model.

- Section navigation is visually quiet.
- Settings groups do not become nested cards inside the dialog.
- Related rows are separated by restrained dividers.
- Theme choices may remain compact visual choices because appearance benefits from direct comparison.
- Boolean settings use accessible switch-shaped native checkbox controls.
- Destructive/maintenance actions remain clearly separated from ordinary preferences.
- Mobile Settings becomes a full-height surface with horizontally scrollable section navigation.

## Motion

Motion exists to explain state change, not to attract attention.

- hover/focus: about 120ms;
- ordinary surface transitions: about 180ms;
- emphasized layer transitions: at most about 220ms;
- card movement: at most 1px;
- `prefers-reduced-motion` removes nonessential transforms and collapses transition duration.

## Accessibility and interaction rules

1. Icon-only controls always have accessible names.
2. Hover never carries capability unavailable to keyboard or touch users.
3. Focus-visible uses the semantic focus token consistently.
4. Color is never the only carrier of state.
5. Touch targets remain at least 40–44px for important controls.
6. Mobile navigation remains inert while closed.
7. Dialog focus containment and restoration remain mandatory.
8. Reversible note actions should not gain unnecessary confirmations.
9. Theme changes must preserve usable contrast in both modes.
10. Visual polish may not weaken V4.0 rendering/search scale behavior.

## Regression contract

Permanent browser coverage protects:

- the designed light and dark token sets;
- tonal note colors;
- quiet navigation counts;
- search focus elevation;
- flat Settings grouping and switch sizing;
- mobile single-overflow card actions;
- responsive behavior at existing supported viewport widths.

The normal formatter, lint, TypeScript, unit, production-build/performance, full Chromium E2E, and PWA/offline gates remain release blockers.
