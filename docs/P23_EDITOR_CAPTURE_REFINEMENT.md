# P23 — Editor & Capture Refinement

## Goal

P23 removes interaction inconsistencies from two of Notes' highest-frequency workflows: editing an existing note and launching a new capture.

Production baseline: `d7aaf6f67f7c177e3bda4874afd46de324f77b41` (P22 production deployment).

This is a refinement phase. It does not add note types, storage concepts, sync payloads, editor persistence behavior, or capture destinations.

## Audit findings and fixes

### 1. Existing-note Add surfaces now use the correct interaction model

The text and checklist editors previously exposed **Add** as `role="menu"` even though the surface can contain compound controls such as OCR image selection, drawing, and voice-recording flows.

P23 treats **Add** as a small non-modal dialog/popover instead:

- the trigger exposes `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`;
- opening the surface moves focus to its first usable control;
- Escape closes only the Add surface and returns focus to the Add trigger;
- pointer or focus movement outside dismisses the surface without closing the editor;
- nested drawing, voice, and OCR dialogs remain inside the interaction boundary;
- opening More closes Add, and opening Add closes More.

The available attachment/OCR actions are unchanged.

### 2. Existing-note More menus match the established P19 keyboard contract

Both text and checklist editors now use one shared menu interaction primitive for **More**.

The menu supports:

- ArrowDown from the trigger to open/focus the first item;
- ArrowUp from the trigger to open/focus the last item;
- ArrowUp/ArrowDown wrap-around navigation;
- Home/End movement;
- Escape dismissal with trigger focus restoration;
- outside pointer/focus dismissal;
- explicit `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, and labeled menu ownership.

This brings existing-note editing into line with the interaction quality already used by note-card action menus.

### 3. Text and checklist editors share one interaction implementation

`EditorActionPopover` owns the common focus and keyboard behavior rather than duplicating slightly different handlers in each editor.

The distinction between surfaces is semantic and intentional:

- **Add** = dialog/popover because it contains compound controls;
- **More** = menu because it contains a flat list of actions.

### 4. Capture busy state is now exclusive

During an asynchronous Quick Start capture, the dialog already disabled its Close button and ignored backdrop dismissal, but two escape paths remained:

- Escape still closed the capture dialog;
- the six primary capture buttons remained actionable.

P23 closes that race. While `aria-busy="true"`:

- Escape is ignored;
- Close remains disabled;
- Text, Checklist, Image, Scan, Drawing, and Voice are disabled;
- Quick Start controls remain disabled;
- hidden image/scan file inputs are disabled as a final guard;
- file-change handling ignores input while busy.

This prevents overlapping capture flows while preserving the existing error/retry behavior.

## Permanent regression coverage

`e2e/p23-editor-capture-refinement.spec.ts` verifies:

1. text-editor Add dialog focus semantics;
2. complete text-editor More keyboard navigation and Escape restoration;
3. matching Add/More behavior in the checklist editor;
4. outside dismissal closes only the local editor popover;
5. an in-flight capture blocks Escape and competing primary capture actions.

Run the focused contract with:

```bash
npm run e2e:p23
```

The full Chromium release suite also discovers these tests automatically.

## Preserved boundaries

P23 intentionally does not change:

- IndexedDB schema/version;
- note, checklist, attachment, reminder, label, or revision record formats;
- the 180 ms checklist autosave timing;
- text editor save/recovery semantics;
- recovery journal formats;
- revision-history checkpoint semantics;
- capture templates or capture destinations;
- OCR, drawing, voice, or attachment storage;
- THIEPN Account authentication/authorization;
- sync payloads, RLS, or conflict behavior;
- backup/import/export formats;
- search indexing or saved-search formats;
- PWA manifest, service worker, or offline data model;
- primary navigation.

No migration is required.

## Certification

P23 is complete only when its exact branch head passes formatting, foundation/release contracts, lint, TypeScript, unit tests, build/performance budget, three-engine browser compatibility, the complete Chromium release suite with retries disabled, P20 composition certification, and PWA/offline certification.
