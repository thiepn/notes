# P4 — Capture, Checklists & Everyday Note Operations

P4 makes everyday note creation and manipulation faster without replacing the local-first storage, checklist, attachment, lifecycle, or selection engines that already work.

## Universal capture

The primary mobile **New** action now opens one capture surface with six intentional choices:

- Text note
- Checklist
- Image
- Scan
- Drawing
- Voice

Image and Scan use the existing local image attachment pipeline. Scan requests camera capture when the platform supports it and opens the existing local OCR controls after the image is attached. Drawing and Voice open their existing local capture dialogs directly. This phase does not claim arbitrary generic-file capture; the current attachment write path remains image/audio specific.

Fast paths remain available:

- `C` — new text note
- `Shift+C` — new checklist
- the sidebar text-capture action remains one-click
- the collapsed composer keeps its checklist/image/drawing/voice shortcuts

All shell-level capture continues to preserve the active label collection established in P3.

## Checklist ergonomics

P4 retains existing Enter/Backspace editing, one-level nesting, Tab/Shift+Tab indentation, drag reorder, touch-safe move/indent buttons, hide/show completed, clear completed, and move-completed-down behavior.

It adds:

- visible completion progress based on meaningful items
- Check all / Uncheck all
- explicit Add item for touch discoverability
- Duplicate item
- root duplication copies its immediate child block and remaps copied parent IDs

No completion timestamp is added because that would require a durable schema/sync migration for a marginal everyday benefit. P4 therefore keeps IndexedDB at version 3.

## Bulk export

Selection mode now exports selected notes as one Markdown ZIP. Text notes use the existing Markdown serializer; checklist exports retain check state and nesting. Duplicate note titles receive collision-safe filenames inside the archive. `fflate` is dynamically imported so ZIP support does not become part of the startup entry bundle.

Existing modifier selection, Shift-range selection, touch long-press, Select all, pin, labels, color, archive, trash, restore, permanent delete, and lifecycle Undo remain authoritative.

## Phase boundaries

P4 does not add folders, generic task due dates, completion timestamps, arbitrary-file storage, AI-assisted capture, or a second persistence model. Those would increase schema or product complexity without improving the core capture loop enough to justify them here.

## Release invariants

P4 is releasable only if:

1. Text/checklist quick capture and recovery journals continue to pass existing tests.
2. Mobile New exposes all supported capture modes without replacing keyboard/sidebar fast paths.
3. Image-only and scan capture preserve notes through the existing attachment lifecycle.
4. Checklist duplication never leaves copied child rows pointing at the original parent.
5. Check-all and progress operate only on meaningful item rows.
6. Bulk export preserves Markdown/checklist structure and handles duplicate filenames.
7. P1–P3 responsive, data-preservation, organization, sync/account, full Chromium, and PWA/offline gates remain green.
8. No database migration or backend schema change is introduced.
