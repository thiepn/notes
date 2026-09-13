# P24 — Reminder Workflow Refinement

## Goal

P24 hardens the reminder workflow already shipped in Notes without adding recurring reminders, a task system, new persistence, or a new notification architecture.

Production baseline: `181fd7c68dc1d046322b635a6cce890c92a58903` (P23 production deployment).

The phase focuses on interaction correctness inside the compact editor reminder control and on keeping the Reminders workspace's time buckets truthful after a tab or installed PWA returns from the background.

## Audit findings and fixes

### 1. Compact reminder expansion now has deterministic focus

The compact reminder trigger previously disappeared when its expanded controls mounted, leaving browser focus without a reliable destination.

P24 adds an explicit focus contract:

- opening a new reminder moves focus into the scheduling editor;
- opening an existing reminder moves focus to the primary Change action;
- entering Change moves focus into the scheduling editor;
- cancelling an existing edit returns focus to the expanded reminder summary;
- collapsing the reminder returns focus to the compact reminder trigger;
- a successful save, snooze, complete, dismiss, or remove also restores focus after the compact trigger becomes available again.

The control remains an inline disclosure inside the note/checklist editor rather than introducing another modal.

### 2. Escape is local and stepwise

Escape inside a compact expanded reminder no longer bubbles to the parent note editor.

The behavior is deliberately layered:

- while scheduling an existing reminder, Escape cancels the scheduling edit and returns to the expanded reminder summary;
- a second Escape collapses the reminder disclosure and restores the compact trigger;
- while scheduling a brand-new reminder, Escape cancels the draft and returns directly to the compact Add reminder trigger;
- while a reminder update is in flight, Escape is ignored so the UI cannot leave the operation in an ambiguous state.

The parent note/checklist editor remains open throughout these local reminder interactions.

### 3. Busy state locks the entire mutable reminder editor

Reminder operations already disabled lifecycle buttons, but scheduling presets and date/time fields could still be changed while a save was pending.

P24 makes the busy boundary consistent:

- quick scheduling presets are disabled;
- day presets are disabled;
- date and time inputs are disabled;
- Cancel and Save remain disabled;
- snooze/lifecycle controls remain disabled;
- the reminder surface exposes `aria-busy`;
- a polite `Updating reminder…` status makes the in-flight operation explicit.

This prevents the visible draft from diverging from the snapshot already being saved.

### 4. Reminder time buckets refresh immediately after foregrounding

The Reminders workspace previously advanced its `now` value only on a one-minute interval. A backgrounded browser/PWA could therefore return with a reminder still shown in its old time bucket until the next interval tick.

P24 initializes `now` at component mount and refreshes it:

- once per minute;
- when the window receives focus;
- when the document becomes visible again.

An active reminder that became overdue while the app was backgrounded therefore moves into **Overdue** immediately after resume.

No reminder timestamp or status is rewritten by this presentation refresh.

## Permanent regression coverage

`e2e/p24-reminder-workflow-refinement.spec.ts` verifies:

1. new-reminder expansion focus and Escape restoration;
2. stepwise Escape behavior for an existing reminder;
3. focus restoration after a successful async save;
4. complete busy-state locking during an intentionally delayed reminder save;
5. Escape suppression while that save is in flight;
6. immediate overdue rebucketing after a foreground/focus event.

Run the focused contract with:

```bash
npm run e2e:p24
```

The normal full Chromium release regression also discovers P24 automatically.

## Preserved boundaries

P24 intentionally does not change:

- IndexedDB schema/version;
- `ReminderRecord` or note/checklist record formats;
- one-reminder-per-note semantics;
- absolute `dueAt` or stored timezone semantics;
- DST validation;
- snooze target calculations;
- active/completed/dismissed lifecycle rules;
- notification de-duplication or service-worker delivery behavior;
- note revision/history behavior;
- sync payloads, RLS, account authorization, or conflict handling;
- backup/import/export formats;
- search `has:reminder` semantics;
- PWA manifest/offline caching;
- primary navigation.

No migration is required.

## Certification

P24 is complete only when its exact branch head passes formatting, foundation/release contracts, lint, TypeScript, unit tests, build/performance budget, three-engine browser compatibility, the complete Chromium release suite with retries disabled, P20 composition certification, and PWA/offline certification.
