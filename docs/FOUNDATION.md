# P1 Foundation Acceptance Contract

P1 makes later product phases cheaper and safer. It does not add a new database schema or replace working user data.

## Foundation responsibilities

- Authoritative Product Contract, Design System, and Architecture documents reflect the actually shipped local-first + optional-sync product.
- Cross-feature events have one canonical contract in `src/app/events.ts`.
- Shared danger, warning, and success states originate in semantic design tokens.
- The final `*-polish.css` layer is removed and small global override styles are consolidated into their owning stylesheets.
- A foundation checker is a permanent CI release gate.
- Compatibility regression coverage protects every durable IndexedDB table and sync metadata.
- The medium-width header grid correction is retained without the invalid modal-through-backdrop test from the superseded patch.

## Non-goals

P1 does not redesign navigation routes, replace the editor architecture, change the sync protocol, add AI, add collaboration, or introduce a database migration. Those belong to later phases and build on this contract rather than destabilize it.

## Exit criteria

- Database version remains 3.
- Existing durable records reopen field-for-field and attachment bytes remain intact.
- No legacy `polish`, `fix`, or `final` stylesheet layer exists.
- No cross-feature `notes-*` event literal exists outside the event contract.
- Shared semantic status colors originate in tokens.
- Standard release CI is fully green.
