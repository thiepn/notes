# P30 — Attachments & Media Workflow Refinement

## Goal

P30 refines the existing attachment and media workflow without changing attachment storage, image normalization, deduplication, backup behavior, sync semantics, or media payloads.

The phase focuses on four daily-use risks in the existing interaction layer:

- attachment mutations could begin before the authoritative saved attachment list finished loading;
- inline removal confirmation did not own Escape, so Escape could close the surrounding editor instead of cancelling the removal intent;
- failed removal did not move focus to the retryable failure state;
- the nested image viewer could close without returning focus to the image the user was viewing because the note editor remains as an underlying modal.

## Authoritative loading gate

For an existing note, the attachment panel now treats the saved attachment list as authoritative before enabling mutation controls.

While the initial list is loading:

- the attachment region exposes `aria-busy="true"`;
- the UI says **Loading saved media…**;
- picker, camera, dropzone, and other mutation controls remain unavailable;
- the empty attachment dropzone is not shown prematurely.

This prevents a late list response from visually racing with an attachment addition.

## Mutation intent locking

Only one attachment mutation intent may be active at a time.

When removal confirmation is open:

- new image additions are disabled;
- other attachment removal actions are disabled;
- preview and download remain available because they are non-destructive;
- the confirmation action receives focus immediately.

While an add or removal is actually running, the attachment region exposes `aria-busy="true"` and mutation controls remain disabled.

The active control uses truthful action copy such as **Adding…**, **Capturing…**, or **Removing…**.

## Removal confirmation recovery

Inline removal confirmation is now keyboard deterministic.

- opening confirmation focuses its primary action;
- pressing **Escape** cancels only the attachment-removal intent;
- Escape no longer dismisses the surrounding note editor while confirmation is active;
- cancellation restores focus to the exact attachment remove button;
- a failed removal leaves the confirmation in place for immediate retry;
- the inline failure receives focus;
- successful removal focuses the completion status because the original attachment control no longer exists.

No new undo model is introduced; the existing explicit confirmation remains the safety boundary for attachment deletion.

## Image viewer focus recovery

The image lightbox remains a nested modal over the note editor.

P30 makes its focus lifecycle deterministic:

- the close button is the initial focus target;
- Arrow Left / Arrow Right continue to navigate images;
- the current image position is live-announced;
- Escape closes only the image viewer;
- closing the viewer returns focus to the grid control for the image that was being viewed, including after keyboard navigation to another image.

This behavior is handled inside the attachment workflow rather than changing the shared dialog focus-trap contract.

## Paste and drag safety

Image paste is only intercepted while attachment mutation is available. If the attachment workflow is loading, busy, or awaiting a removal decision, P30 does not swallow a new image paste attempt.

Drag-and-drop likewise avoids creating a competing mutation while the workflow is locked.

## Permanent regression coverage

`e2e/p30-attachments-media-workflow-refinement.spec.ts` verifies:

- authoritative attachment loading and disabled mutation controls;
- removal-confirmation focus;
- Escape cancellation without closing the editor;
- focus restoration to the exact remove control;
- busy removal state;
- retryable synthetic removal failure and focused error;
- successful retry and focused completion status;
- nested lightbox initial focus;
- keyboard image navigation;
- lightbox close focus returning to the currently viewed image.

Run the focused suite with:

```text
npm run e2e:p30
```

The complete no-retry release regression remains authoritative before merge.

## Preserved boundaries

P30 does **not** change:

- IndexedDB schema or database version;
- attachment record fields or blob payloads;
- image MIME acceptance rules;
- image normalization or metadata stripping;
- attachment checksum or duplicate suppression semantics;
- attachment ownership or note relationship semantics;
- download payloads or filenames;
- voice recording payloads;
- backup/export/import formats;
- sync/account/privacy/history/reminder/search/lifecycle architecture;
- note editor save semantics.

P30 is an interaction-safety and focus-recovery layer over the existing attachment engine.
