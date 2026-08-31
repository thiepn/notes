# Architecture Decisions

## Hosting

The production application is a static PWA deployed from GitHub Pages and rooted at `/notes/`, targeting `https://thiepn.dev/notes/`.

## Runtime model

The application is local-first. IndexedDB is the source of truth for user data. Network access is never required for core note operations after the application shell is cached.

## Approved stack

- React 19
- TypeScript 6.0.x while current lint tooling lacks TypeScript 7 support
- Vite 8
- Dexie 4 over IndexedDB
- Zod for validation at import/storage boundaries
- Lucide for icons
- Radix primitives only where accessible low-level overlays/menus are needed
- Vite PWA + Workbox for the service-worker layer
- Vitest for unit tests
- Playwright for end-to-end and regression tests
- ESLint + Prettier for code quality

## Deliberate omissions

P0 does not introduce Redux, a client router, a rich-text editor, a large UI framework, a backend SDK, or a cloud database. Dependencies are added when a concrete phase needs them.

## Path invariant

All production assets and navigation must function from `/notes/`. The project must not assume domain-root deployment.

## Reliability rule

From P1 onward, UI components must use a data-access layer rather than writing raw IndexedDB queries directly. Schema migrations and recovery behavior are treated as product features, not implementation details.
