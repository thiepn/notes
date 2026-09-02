#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

path = Path('src/features/notes/NoteCard.tsx')
text = path.read_text()
old = "import { formatReminderShort } from '../reminders/reminderTime';"
new = "import { formatReminderShort, isReminderOverdue } from '../reminders/reminderTime';"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('NoteCard reminder import marker changed.')

old = '<span className="note-card-reminder" data-status={reminder.status}>'
new = '''<span
          className="note-card-reminder"
          data-status={reminder.status}
          data-overdue={reminder.status === 'active' && isReminderOverdue(reminder.dueAt)}
        >'''
if old in text:
    text = text.replace(old, new, 1)
elif 'data-overdue={reminder.status' not in text:
    raise SystemExit('NoteCard reminder chip marker changed.')
path.write_text(text)

path = Path('README.md')
text = path.read_text()
old = '''**V3.4 — Editor & Note Interaction Polish is implemented as the fourth V3 refinement release.** Existing text-note and checklist editors now expose persistence-backed autosave state, last-saved time, useful content metrics, and a discoverable Ctrl/Cmd+Enter close shortcut without changing stored note semantics or recovery behavior.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, and V3.4 existing-note editing feedback and ergonomics.
'''
new = '''**V3.5 — Reminders & Time UX Polish is implemented as the fifth V3 refinement release.** Existing local reminders now schedule faster, snooze more flexibly, communicate overdue state clearly, and group upcoming reminders into more useful local-calendar buckets without changing the reminder schema or notification architecture.

V1 through P15 remains the stable product foundation and V2-1 through V2-8 complete the feature roadmap through Privacy Enhancements. The V3 refinement track preserves that architecture while improving daily use: V3.1 polishes capture and mobile UX, V3.2 retrieval and search, V3.3 organization and navigation, V3.4 existing-note editing feedback and ergonomics, and V3.5 reminder/time interaction quality.
'''
if old in text:
    text = text.replace(old, new, 1)
elif '**V3.5 — Reminders & Time UX Polish' not in text:
    raise SystemExit('README V3.4 status block changed.')

text = text.replace(
    '- Overdue, Today, Upcoming, and Completed & dismissed reminder groups',
    '- Overdue, Today, Tomorrow, Next 7 days, Later, and Completed & dismissed reminder groups',
    1,
)

marker = '## Architecture\n'
section = '''## V3.5 scope

V3.5 refines the existing V2-1 reminder system without adding another persistence model:

- Quick scheduling for **In 1 hour**, **Tomorrow 9:00**, and **Next week 9:00**
- Existing Today / Tomorrow / Next week date-only presets retained for manual time selection
- Snooze choices for **10 minutes**, **1 hour**, and **Tomorrow 9:00**
- Clear `Overdue · …` wording on active reminder chips and editor summaries
- Card-level overdue state exposed for restrained visual emphasis
- Local-calendar grouping into Overdue, Today, Tomorrow, Next 7 days, and Later
- Section-level reminder counts plus active/history totals in the Reminders workspace
- DST-safe local-day grouping derived from calendar dates instead of elapsed 24-hour windows
- Existing absolute `dueAt` timestamp + scheduling timezone storage preserved
- Snooze continues to reactivate the existing reminder record and clear notification de-duplication state

V3.5 requires **no database migration**. It deliberately excludes recurring reminders, location reminders, task projects, cloud scheduling, background servers, and any new claim of reliable notification delivery while every Notes tab/PWA window is closed.

'''
if '## V3.5 scope' not in text:
    if marker not in text:
        raise SystemExit('README architecture marker changed.')
    text = text.replace(marker, section + marker, 1)
path.write_text(text)

path = Path('docs/REMINDERS.md')
text = path.read_text()
text = text.replace(
    'Presets are available for Today, Tomorrow, and Next week.',
    'Presets are available for Today, Tomorrow, and Next week. V3.5 also adds one-click quick scheduling for In 1 hour, Tomorrow 9:00, and Next week 9:00 while leaving the date/time inputs editable.',
    1,
)
text = text.replace(
    '- snoozed one hour',
    '- snoozed 10 minutes, one hour, or until 09:00 tomorrow',
    1,
)
old_groups = '''- Overdue
- Today
- Upcoming
- Completed & dismissed'''
new_groups = '''- Overdue
- Today
- Tomorrow
- Next 7 days
- Later
- Completed & dismissed'''
if old_groups in text:
    text = text.replace(old_groups, new_groups, 1)

phase_marker = '## Phase boundary\n'
v35 = '''## V3.5 reminder/time UX polish

V3.5 is a presentation and interaction refinement over the same reminder rows introduced in V2-1.

Scheduling gains three fast paths: In 1 hour, Tomorrow at 09:00, and Next week at 09:00. These presets populate the existing local date/time draft and therefore still pass through the same DST validation and `RemindersRepository.set()` write path as manual scheduling.

Active reminders gain three snooze targets: 10 minutes, one hour, and 09:00 tomorrow. Snooze still calls the existing repository method, keeps the reminder active, and clears `lastNotifiedAt` so the new due time can notify once.

The Reminders workspace now derives five active time buckets from the stored absolute timestamp: Overdue, Today, Tomorrow, Next 7 days, and Later. Calendar-day distance is computed from local year/month/day values rather than dividing elapsed milliseconds by 24 hours, so a DST transition does not move a reminder into the wrong local-date section.

Reminder cards and compact editor controls now use explicit overdue wording. The card chip also exposes `data-overdue` for visual treatment without changing reminder state.

Section counts and the workspace active/history summary are derived UI state only. No count, bucket, or relative-time value is persisted.

'''
if '## V3.5 reminder/time UX polish' not in text:
    if phase_marker not in text:
        raise SystemExit('REMINDERS phase boundary marker changed.')
    text = text.replace(phase_marker, v35 + phase_marker, 1)
path.write_text(text)
PY

npx prettier --write src/features/notes/NoteCard.tsx src/features/reminders src/styles/reminders.css e2e/reminders.spec.ts e2e/reminders-time-polish.spec.ts README.md docs/REMINDERS.md

if ! git diff --quiet -- .; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git add src/features/notes/NoteCard.tsx src/features/reminders src/styles/reminders.css e2e/reminders.spec.ts e2e/reminders-time-polish.spec.ts README.md docs/REMINDERS.md
  git commit -m "V3.5: integrate reminder and time UX polish"
  git push origin HEAD:v3-5-reminders-time-polish
fi
