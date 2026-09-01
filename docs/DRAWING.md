# Drawing

V2-4 / P24 adds fast local sketching to Notes without introducing a parallel drawing database or weakening the existing attachment, backup, and offline model.

## Persistence model

A drawing is editable only while its drawing session is open. When the user chooses **Save drawing**, Notes renders the current sketch to a portable PNG and stores it through the existing attachment repository.

V2-4 therefore requires **no database migration**.

Saved drawings automatically inherit the mature attachment behavior for:

- IndexedDB persistence,
- per-note attachment limits and storage safety checks,
- SHA-256 duplicate detection,
- image validation and privacy-safe processing,
- card thumbnails,
- image viewing and download,
- Archive and Trash lifecycle behavior,
- permanent-delete cleanup,
- backup and restore,
- Google Keep-era attachment compatibility,
- offline/PWA operation.

The PNG attachment is the persisted source of truth after save. V2-4 deliberately does not retain a hidden vector-stroke document beside it.

## Capture surfaces

Drawing is available from:

- the collapsed new-note quick-action row,
- an expanded new text-note composer,
- an existing text-note editor,
- an existing checklist editor.

Using the collapsed quick action expands text-note capture but does not create a database note immediately. The note is ensured only when a non-empty drawing is actually saved. This keeps cancelled blank drawings from creating empty-note clutter.

Because attachment-only text notes are already preserved by the capture system, a sketch can be the entire content of a note.

## Canvas

The logical drawing canvas is **1200 × 800 px** with a 3:2 aspect ratio.

The UI scales responsively to the available viewport while pointer coordinates are mapped back into the fixed logical coordinate space. This keeps exported output consistent across desktop, tablet, and mobile screen sizes.

The canvas accepts Pointer Events, so the same interaction path supports:

- mouse,
- touch,
- stylus/pen input exposed through the browser Pointer Events model.

The canvas uses `touch-action: none` while drawing so touch gestures do not scroll the page instead of producing strokes.

## Tools

V2-4 includes:

- Pen
- Eraser
- Five pen colors
- Three stroke widths
- Undo
- Redo
- Clear
- Cancel
- Save drawing

Undo and redo operate on whole strokes rather than individual pointer samples.

The eraser is implemented as canvas compositing during the active session. It removes pixels from the in-session sketch and is flattened into the saved PNG.

## Export

A saved drawing is exported as `image/png` at **1200 × 800 px**.

Before export, Notes creates a clean export canvas, paints an opaque white background, and draws the current sketch over it. The resulting attachment receives a timestamped filename such as:

```text
drawing-2026-09-01T13-00-00-000Z.png
```

The exported file then passes through the same attachment ingestion pipeline as any user-added PNG.

## Empty and cancelled drawings

Save is disabled until at least one committed stroke exists.

If the user:

- opens Drawing and closes it,
- presses Escape,
- or selects Cancel,

no attachment is created.

For quick drawing capture, cancellation also avoids creating an otherwise empty note.

## Modal isolation

Drawing can be launched from inside another editor, so modal isolation is release-critical.

The drawing dialog stops keyboard and pointer bubbling to its parent editor. Pressing Escape while Drawing is active closes **only the drawing dialog**, not the underlying text-note or checklist editor.

The drawing close control receives initial focus so keyboard events belong to the active drawing dialog immediately.

## Attachment refresh

After a successful save, the drawing attachment is reported through the same `onAttachmentsChanged` path used by image upload. The current attachment panel and note-card attachment preview therefore refresh through existing application state rather than requiring a page reload.

## Accessibility and responsive behavior

The drawing dialog exposes:

- an accessible modal label,
- labelled pen and eraser buttons,
- pressed states for active tools, colors, and widths,
- labelled Undo, Redo, Clear, Close, Cancel, and Save controls,
- a labelled drawing canvas,
- disabled states when an action is unavailable,
- live save/error status.

On small screens the drawing editor becomes full-screen and respects safe-area insets.

## Phase boundary

V2-4 deliberately excludes:

- reopening a saved PNG as editable vector strokes,
- shape tools,
- text boxes,
- layers,
- selection/move/transform tools,
- background templates,
- handwriting recognition,
- OCR,
- collaborative drawing,
- cloud-specific drawing synchronization.

Those capabilities would require materially different persistence or editing models. V2-4 stays aligned with Notes' fast-capture model: draw, save, view, export, and remove.

## Regression requirements

A V2-4 release must prove that:

- pointer input creates strokes,
- Save remains disabled for an empty canvas,
- Undo removes the latest stroke and Redo restores it,
- color and width controls can be changed,
- pen/eraser tool state is explicit,
- a quick drawing creates an attachment-only note only when saved,
- saved output is a valid `image/png` attachment,
- saved output remains 1200 × 800 px after normal attachment ingestion,
- the attachment appears without a reload,
- drawing-only notes survive composer close and render an image preview on the card,
- existing text notes can receive drawings,
- checklist notes can receive drawings,
- Escape closes only Drawing when launched from another editor,
- existing attachment limits and lifecycle behavior remain intact,
- the complete Chromium regression suite remains green,
- production PWA/offline certification remains green.
