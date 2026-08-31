# Design System

P2 establishes the permanent application shell and visual contract for Notes. Later feature phases should extend this system rather than introducing isolated styles.

## Product direction

The interface is intentionally quiet and utilitarian: neutral application chrome, restrained elevation, minimal motion, and color concentrated in note content rather than navigation. It should feel as immediate as Google Keep without reproducing Keep pixel-for-pixel.

## CSS structure

- `src/styles/tokens.css` — colors, typography scale, spacing, radii, shadows, motion, layout dimensions, z-index layers, and future note colors.
- `src/styles/base.css` — document reset, font defaults, focus behavior, selection, and reduced-motion handling.
- `src/styles/shell.css` — header, search shell, navigation, responsive workspace, empty states, and mobile drawer behavior.
- `src/styles.css` — stable import entry point.

Feature-specific styles should use the shared tokens and remain outside `tokens.css`.

## Themes

Supported preferences are `system`, `light`, and `dark`.

- The preference is stored locally under `notes.theme`.
- `system` follows `prefers-color-scheme` live.
- An inline bootstrap in `index.html` resolves the initial theme before React mounts to avoid a light/dark flash.
- React updates `data-theme`, `color-scheme`, and the browser `theme-color` metadata.
- Dark mode has dedicated semantic surfaces and dedicated note colors; it is not a simple inversion.

## Layout contract

### Header

- Height: 64px.
- Sticky at the top of the viewport.
- Leading navigation control and brand.
- Centered search region reserved for P9.
- Appearance control on the trailing edge.

### Sidebar

- Desktop (1100px+): 272px expanded, 80px user-collapsed.
- Medium (768–1099px): automatic 80px icon rail.
- Mobile (<768px): off-canvas drawer with backdrop and Escape dismissal.
- Mobile closed drawers are inert so off-screen controls cannot receive keyboard focus.

### Workspace

- Flexible content area independent of sidebar width.
- Maximum content width: 1600px.
- Responsive horizontal padding.
- Ready for P4 masonry/grid content without restructuring the shell.

## Target viewports

The permanent regression matrix covers widths of 320, 375, 430, 768, 1024, 1280, 1440, and 1920 pixels. Each target asserts that the document has no horizontal overflow.

## Interaction rules

1. Routine controls use native buttons and semantic landmarks.
2. Icon-only controls always have accessible names.
3. Hover states never carry information that is unavailable to keyboard/touch users.
4. Focus-visible states use the semantic focus token.
5. `prefers-reduced-motion` collapses nonessential transitions.
6. Mobile navigation must close through backdrop, navigation choice, or Escape.
7. Do not introduce confirmation dialogs for reversible future note actions.

## Styling rules for later phases

1. Do not hard-code feature colors when a semantic token exists.
2. New note colors must define both light and dark values.
3. Reuse spacing and radius tokens before creating new values.
4. Keep the application chrome neutral; note cards provide most content color.
5. Prefer progressive disclosure over permanently visible controls.
6. Avoid large UI-framework dependencies unless a concrete accessibility or interaction requirement justifies them.
7. Preserve the `/notes/` hosting path and the 320px minimum supported viewport.

## Current primitives

- `IconButton` — consistent circular icon action with accessible label and native tooltip.
- `AppHeader` — stable header structure and appearance control.
- `AppSidebar` — responsive primary navigation shell.
- `ThemeProvider` / `ThemeContext` — appearance preference and live system-theme resolution.

Additional primitives should be introduced only when a feature phase has a real need for them.
