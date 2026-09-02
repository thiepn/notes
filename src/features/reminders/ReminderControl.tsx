import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Clock3, X } from 'lucide-react';

import type { ReminderRecord, RemindersRepository } from '../../db';
import { dispatchReminderChanged } from './reminderEvents';
import {
  applyReminderDatePreset,
  applyReminderQuickPreset,
  currentTimeZone,
  defaultReminderTimestamp,
  formatReminderDateTime,
  formatReminderShort,
  localInputFromTimestamp,
  parseLocalReminderInput,
  reminderSnoozeTimestamp,
} from './reminderTime';

interface ReminderControlProps {
  noteId: string;
  repository: RemindersRepository;
  reminder?: ReminderRecord | null;
  compact?: boolean;
  onChanged(reminder: ReminderRecord | null): void;
}

export function ReminderControl({
  noteId,
  repository,
  reminder: controlledReminder,
  compact = false,
  onChanged,
}: ReminderControlProps) {
  const [loadedReminder, setLoadedReminder] = useState<ReminderRecord | null>(
    controlledReminder ?? null,
  );
  const reminder = controlledReminder === undefined ? loadedReminder : controlledReminder;
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() =>
    localInputFromTimestamp(reminder?.dueAt ?? defaultReminderTimestamp()),
  );
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (controlledReminder !== undefined) return;
    let cancelled = false;
    void repository.getForNote(noteId).then((stored) => {
      if (!cancelled) setLoadedReminder(stored ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [controlledReminder, noteId, repository]);

  const openEditor = () => {
    setDraft(localInputFromTimestamp(reminder?.dueAt ?? defaultReminderTimestamp()));
    setErrorMessage(null);
    setExpanded(true);
    setEditing(true);
  };

  const openCompact = () => {
    if (!reminder) {
      openEditor();
      return;
    }
    setErrorMessage(null);
    setExpanded(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    if (compact && !reminder) setExpanded(false);
  };

  const save = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const dueAt = parseLocalReminderInput(draft);
      const saved = await repository.set(noteId, { dueAt, timeZone: currentTimeZone() });
      setLoadedReminder(saved);
      onChanged(saved);
      setEditing(false);
      if (compact) setExpanded(false);
      dispatchReminderChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const run = async (operation: () => Promise<ReminderRecord | boolean>, remove = false) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await operation();
      const next = remove ? null : (result as ReminderRecord);
      setLoadedReminder(next);
      onChanged(next);
      setEditing(false);
      if (compact) setExpanded(false);
      dispatchReminderChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const snooze = (preset: Parameters<typeof reminderSnoozeTimestamp>[0]) =>
    run(() => repository.snooze(noteId, reminderSnoozeTimestamp(preset)));

  if (compact && !expanded && !editing) {
    const label = reminder
      ? reminder.status === 'active'
        ? formatReminderShort(reminder.dueAt)
        : reminder.status === 'completed'
          ? 'Reminder completed'
          : 'Reminder dismissed'
      : 'Add reminder';

    return (
      <section className="reminder-control reminder-control-compact" aria-label="Reminder">
        <button
          className="reminder-compact-button"
          type="button"
          aria-label={reminder ? `Change reminder: ${label}` : 'Add reminder'}
          onClick={openCompact}
          disabled={busy}
        >
          <Bell aria-hidden="true" />
          <span>{label}</span>
        </button>
        {errorMessage ? (
          <p className="reminder-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`reminder-control${compact ? ' reminder-control-compact-expanded' : ''}`}
      aria-label="Reminder"
    >
      <div className="reminder-control-summary">
        <Bell aria-hidden="true" />
        <div>
          <strong>
            {reminder
              ? reminder.status === 'active'
                ? formatReminderShort(reminder.dueAt)
                : reminder.status === 'completed'
                  ? 'Reminder completed'
                  : 'Reminder dismissed'
              : 'No reminder'}
          </strong>
          {reminder ? (
            <span>
              {reminder.status === 'active'
                ? `${formatReminderDateTime(reminder.dueAt)} · ${reminder.timeZone}`
                : `Last scheduled for ${formatReminderDateTime(reminder.dueAt)}`}
            </span>
          ) : (
            <span>Add a date and time to this note.</span>
          )}
        </div>
        <button
          className="reminder-control-edit"
          type="button"
          onClick={openEditor}
          disabled={busy}
        >
          {reminder ? 'Change' : 'Add reminder'}
        </button>
        {compact && !editing ? (
          <button
            className="reminder-control-collapse"
            type="button"
            onClick={() => setExpanded(false)}
            disabled={busy}
          >
            Done
          </button>
        ) : null}
      </div>

      {reminder?.status === 'active' && !editing ? (
        <div className="reminder-control-actions">
          <div className="reminder-snooze-actions" aria-label="Snooze reminder">
            <span>Snooze</span>
            <button type="button" disabled={busy} onClick={() => void snooze('ten-minutes')}>
              <Clock3 aria-hidden="true" /> 10 min
            </button>
            <button type="button" disabled={busy} onClick={() => void snooze('one-hour')}>
              <Clock3 aria-hidden="true" /> 1 hour
            </button>
            <button type="button" disabled={busy} onClick={() => void snooze('tomorrow-morning')}>
              <Clock3 aria-hidden="true" /> Tomorrow 9:00
            </button>
          </div>
          <div className="reminder-lifecycle-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => repository.complete(noteId))}
            >
              <CheckCircle2 aria-hidden="true" /> Complete
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => repository.dismiss(noteId))}
            >
              <BellOff aria-hidden="true" /> Dismiss
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => repository.remove(noteId), true)}
            >
              <X aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="reminder-editor" role="group" aria-label="Set reminder">
          <div className="reminder-quick-presets" role="group" aria-label="Quick presets">
            <span>Quick</span>
            <button type="button" onClick={() => setDraft(applyReminderQuickPreset('in-one-hour'))}>
              In 1 hour
            </button>
            <button
              type="button"
              onClick={() => setDraft(applyReminderQuickPreset('tomorrow-morning'))}
            >
              Tomorrow 9:00
            </button>
            <button
              type="button"
              onClick={() => setDraft(applyReminderQuickPreset('next-week-morning'))}
            >
              Next week 9:00
            </button>
          </div>
          <div className="reminder-presets" role="group" aria-label="Day presets">
            <span>Date</span>
            <button
              type="button"
              onClick={() => setDraft((current) => applyReminderDatePreset(current, 0))}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDraft((current) => applyReminderDatePreset(current, 1))}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setDraft((current) => applyReminderDatePreset(current, 7))}
            >
              Next week
            </button>
          </div>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={draft.date}
              onChange={(event) =>
                setDraft((current) => ({ ...current, date: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Time</span>
            <input
              type="time"
              value={draft.time}
              onChange={(event) =>
                setDraft((current) => ({ ...current, time: event.target.value }))
              }
            />
          </label>
          <div className="reminder-editor-actions">
            <button type="button" disabled={busy} onClick={cancelEditing}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save reminder'}
            </button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="reminder-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The reminder could not be updated.';
}
