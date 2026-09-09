# Notes Design System — P1 Foundation

## Direction

The visual language is **Paper & Ink**: editorial rather than dashboard-like, restrained rather than decorative, and designed around the written document. Light mode uses warm paper surfaces; dark mode uses neutral graphite. Vermilion is a limited interaction accent rather than a decorative theme color.

Hierarchy comes primarily from typography, whitespace, alignment, dividers, and state—not gradients, glass effects, floating cards, oversized pills, or ornamental shadows.

## Canonical tokens

`src/styles/tokens.css` is the only source for shared visual primitives: font families and type scale; spacing; radii; elevation; motion; z-index layers; shell dimensions; light/dark semantic surfaces; note colors; and accent, focus, danger, warning, and success states.

Feature styles use semantic tokens instead of copying shared status colors.

## CSS ownership

`src/styles.css` is the single stylesheet entry point. Import order is explicit and checked in CI.

- `tokens.css` — shared primitives, always first.
- `base.css` — reset, global typography, focus, reduced-motion, and forced-colors contracts, always second.
- `shell.css` — app chrome, navigation, workspace geometry, and responsive shell.
- `notes.css` plus feature-owned note styles — note presentation and note-specific behaviors.
- `search.css` — all search/filter/retrieval presentation; there is no later search “polish” layer.
- `settings.css` — all Settings and account/sync form presentation.
- `attachments.css`, `reminders.css`, and other feature styles — scoped owners for substantial feature surfaces.
- `utilities.css` — small shared deferred-loading helpers only; it is not a redesign override layer.

### Forbidden architecture

Do not add files named `*-polish.css`, `*-final.css`, or `*-fix.css`. A visual correction belongs in the stylesheet that owns the component. Do not append a late global redesign layer to win specificity conflicts.

## Shape and elevation

- Most controls are compact rectangles with 3–6px radii.
- Pills are reserved for objects that are semantically chips, counters, or switches.
- Note surfaces are near-flat.
- Menus and dialogs may use stronger elevation because they represent a real layer change.
- Hover clarifies interactivity but never carries capability unavailable to touch or keyboard users.

## Typography

- Display serif is reserved for notebook, workspace, and document hierarchy.
- Sans-serif is the default interaction and body UI face.
- Monospace is reserved for metadata, shortcuts, counts, and technical state.
- Body copy optimizes reading width and line height before density.
- Bold weight is not a substitute for layout hierarchy.

## Theme contract

Supported appearance preferences are `system`, `light`, and `dark`, stored under `notes.theme`. Initial theme resolution occurs before React mounts. Both themes preserve contrast and semantic status distinctions.

## Interaction contract

1. Icon-only controls have accessible names.
2. Keyboard, touch, and pointer users can reach the same capabilities.
3. Important mobile targets are at least 40–44px.
4. Focus-visible uses the semantic focus token.
5. Forced-colors and reduced-motion behavior are part of `base.css`, not an afterthought layer.
6. Dialog focus containment, nested-dialog behavior, and trigger focus restoration are mandatory.
7. Color is never the sole carrier of state.
8. The app does not horizontally overflow at supported viewport widths.
9. Background sync and derived refreshes do not remount or reset an active document.

## Responsive contract

Minimum supported width is 320px. The permanent browser matrix includes 320, 390, 768, 820, 1024, 1280, 1440, and 1920px, with additional widths added when a real regression requires them.

Desktop, tablet, and mobile may use different compositions; shrinking desktop chrome is not considered mobile design.

## Enforcement

`scripts/check-foundation-contract.mjs` is a CI release gate. It rejects obsolete patch-layer filenames, duplicate/missing stylesheet ownership, scattered application event literals, and reintroduction of shared hard-coded status colors.
