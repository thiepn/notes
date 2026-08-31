import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Clock3, X } from 'lucide-react';

import type { ReminderRecord, RemindersRepository } from '../../db';
import {
  applyReminderDatePreset,
  currentTimeZone,
  defaultReminderTimestamp,
  formatReminderDateTime,
  localInputFromTimestamp,
  parseLocalReminderInput,
} from './reminderTime';

interface ReminderControlProps {
  noteId: string;
  repository: RemindersRepository;
  reminder?: ReminderRecord | null;
  onChanged(reminder: ReminderRecord | null): void;
}

export function ReminderControl({
  noteId,
  repository,
  reminder: controlledReminder,
  onChanged,
}: ReminderControlProps) {
  const [loadedReminder, setLoadedReminder] = useState<ReminderRecord | null>(
    controlledReminder ?? null,
  );
  const reminder = controlledReminder === undefined ? loadedReminder : controlledReminder;
  const [editing, setEditing] = useState(false);
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
    setEditing(true);
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
      dispatchReminderChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reminder-control" aria-label="Reminder">
      <div className="reminder-control-summary">
        <Bell aria-hidden="true" />
        <div>
          <strong>
            {reminder
              ? reminder.status === 'active'
                ? formatReminderDateTime(reminder.dueAt)
                : reminder.status === 'completed'
                  ? 'Reminder completed'
                  : 'Reminder dismissed'
              : 'No reminder'}
          </strong>
          {reminder ? (
            <span>
              {reminder.status === 'active'
                ? `Saved in ${reminder.timeZone}`
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
      </div>

      {reminder?.status === 'active' && !editing ? (
        <div className="reminder-control-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => repository.snooze(noteId, Date.now() + 60 * 60 * 1000))}
          >
            <Clock3 aria-hidden="true" /> Snooze 1 hour
          </button>
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
      ) : null}

      {editing ? (
        <div className="reminder-editor" role="group" aria-label="Set reminder">
          <div className="reminder-presets">
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
            <button type="button" disabled={busy} onClick={() => setEditing(false)}>
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

export function dispatchReminderChanged(): void {
  window.dispatchEvent(new CustomEvent('notes-reminders-changed'));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The reminder could not be updated.';
}
