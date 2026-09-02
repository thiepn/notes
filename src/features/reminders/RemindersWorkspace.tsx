import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, LayoutGrid, Rows3 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import {
  AttachmentsRepository,
  ChecklistsRepository,
  LabelsRepository,
  NotesRepository,
  RemindersRepository,
  notesDatabase,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteColor,
  type NoteRecord,
  type ReminderRecord,
} from '../../db';
import { LifecycleToast, type LifecycleToastState } from '../notes/LifecycleToast';
import { MasonryGrid } from '../notes/MasonryGrid';
import type { NoteCardActions } from '../notes/NoteCard';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from '../notes/viewMode';
import { ReminderNotificationSettings } from './ReminderNotificationSettings';
import { reminderTimeBucket } from './reminderTime';

const notesRepository = new NotesRepository(notesDatabase);
const remindersRepository = new RemindersRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);
const checklistsRepository = new ChecklistsRepository(notesDatabase);
const attachmentsRepository = new AttachmentsRepository(notesDatabase);
const ChecklistEditorDialog = lazy(() =>
  import('../notes/ChecklistEditorDialog').then((module) => ({
    default: module.ChecklistEditorDialog,
  })),
);
const NoteEditorDialog = lazy(() =>
  import('../notes/NoteEditorDialog').then((module) => ({ default: module.NoteEditorDialog })),
);
const INITIAL_REMINDER_NOW = Date.now();

interface RemindersWorkspaceProps {
  labels: LabelRecord[];
}

interface ReminderCollection {
  notes: NoteRecord[];
  remindersByNote: Record<string, ReminderRecord>;
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  loaded: boolean;
}

const EMPTY_COLLECTION: ReminderCollection = {
  notes: [],
  remindersByNote: {},
  labelIdsByNote: {},
  checklistItemsByNote: {},
  loaded: false,
};

export function RemindersWorkspace({ labels }: RemindersWorkspaceProps) {
  const [collection, setCollection] = useState<ReminderCollection>(EMPTY_COLLECTION);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());
  const [attachmentRefreshByNote, setAttachmentRefreshByNote] = useState<Record<string, number>>(
    {},
  );
  const [toast, setToast] = useState<LifecycleToastState | null>(null);
  const [now, setNow] = useState(INITIAL_REMINDER_NOW);

  const showToast = useCallback((message: string, undo?: () => Promise<void>) => {
    const id = crypto.randomUUID();
    setToast(undo ? { id, message, undo } : { id, message });
  }, []);

  const reload = useCallback(async () => {
    const visible = await remindersRepository.listVisibleWithNotes();
    const noteIds = visible.map((entry) => entry.noteId);
    const noteRows = await Promise.all(noteIds.map((noteId) => notesRepository.get(noteId)));
    const notes = noteRows.filter((note): note is NoteRecord => Boolean(note));
    const actualNoteIds = notes.map((note) => note.id);
    const checklistIds = notes.filter((note) => note.type === 'checklist').map((note) => note.id);
    const [labelIdsByNote, checklistItemsByNote] = await Promise.all([
      labelsRepository.labelIdsByNote(actualNoteIds),
      checklistsRepository.itemsByNote(checklistIds),
    ]);
    const remindersByNote = Object.fromEntries(
      visible.map((entry) => [entry.noteId, entry.reminder]),
    );
    setCollection({ notes, remindersByNote, labelIdsByNote, checklistItemsByNote, loaded: true });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(reload)
      .catch(() => {
        if (!cancelled) {
          setCollection({ ...EMPTY_COLLECTION, loaded: true });
          showToast('Reminders could not be loaded.');
        }
      });
    const handleChanged = () => void reload();
    window.addEventListener('notes-reminders-changed', handleChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('notes-reminders-changed', handleChanged);
    };
  }, [reload, showToast]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(() => {
    const active = collection.notes.filter(
      (note) => collection.remindersByNote[note.id]?.status === 'active',
    );
    const history = collection.notes.filter(
      (note) => collection.remindersByNote[note.id]?.status !== 'active',
    );
    const byDue = (a: NoteRecord, b: NoteRecord) =>
      (collection.remindersByNote[a.id]?.dueAt ?? 0) -
      (collection.remindersByNote[b.id]?.dueAt ?? 0);
    const inBucket = (note: NoteRecord, bucket: ReturnType<typeof reminderTimeBucket>) => {
      const dueAt = collection.remindersByNote[note.id]?.dueAt;
      return dueAt !== undefined && reminderTimeBucket(dueAt, now) === bucket;
    };

    const overdue = active.filter((note) => inBucket(note, 'overdue')).sort(byDue);
    const today = active.filter((note) => inBucket(note, 'today')).sort(byDue);
    const tomorrow = active.filter((note) => inBucket(note, 'tomorrow')).sort(byDue);
    const nextSevenDays = active.filter((note) => inBucket(note, 'next-seven-days')).sort(byDue);
    const later = active.filter((note) => inBucket(note, 'later')).sort(byDue);
    history.sort(
      (a, b) =>
        (collection.remindersByNote[b.id]?.updatedAt ?? 0) -
        (collection.remindersByNote[a.id]?.updatedAt ?? 0),
    );
    return { overdue, today, tomorrow, nextSevenDays, later, history };
  }, [collection, now]);

  const handleSaved = useCallback(() => void reload(), [reload]);
  const handleChecklistSaved = useCallback(() => void reload(), [reload]);
  const handleAttachmentsChanged = useCallback((noteId: string) => {
    setAttachmentRefreshByNote((current) => ({
      ...current,
      [noteId]: (current[noteId] ?? 0) + 1,
    }));
  }, []);

  const actions = useMemo<NoteCardActions>(
    () => ({
      open: (note) => setEditingNoteId(note.id),
      togglePin: () => undefined,
      archive: (note) => {
        void notesRepository
          .archive(note.id, note.revision)
          .then(reload)
          .catch(() => {
            showToast('Note could not be archived.');
          });
      },
      unarchive: (note) => {
        void notesRepository
          .unarchive(note.id, note.revision)
          .then(reload)
          .catch(() => {
            showToast('Note could not be moved to Notes.');
          });
      },
      trash: (note) => {
        void notesRepository
          .trash(note.id, note.revision)
          .then(reload)
          .catch(() => {
            showToast('Note could not be moved to trash.');
          });
      },
      restore: () => undefined,
      duplicate: (note) => {
        void notesRepository
          .duplicate(note.id)
          .then(() => showToast('Copy created in Notes without a reminder.'))
          .catch(() => showToast('Note could not be duplicated.'));
      },
      deletePermanently: () => undefined,
      setColor: (note, color) => void setColor(note, color, reload, showToast),
      setLabels: (note, labelIds) => void setLabels(note, labelIds, reload, showToast),
    }),
    [reload, showToast],
  );

  const editingNote = collection.notes.find((note) => note.id === editingNoteId) ?? null;
  const total = collection.notes.length;
  const activeCount =
    groups.overdue.length +
    groups.today.length +
    groups.tomorrow.length +
    groups.nextSevenDays.length +
    groups.later.length;
  const historyCount = groups.history.length;

  const handleViewMode = (next: NotesViewMode) => {
    setViewMode(next);
    writeNotesViewMode(next);
  };

  return (
    <>
      <ReminderNotificationSettings />

      {total > 0 ? (
        <div className="notes-board reminder-board" data-view={viewMode} data-mode="reminders">
          <div className="notes-toolbar">
            <span className="notes-count reminder-count-summary">
              <strong>{activeCount}</strong> active
              {historyCount > 0 ? <span> · {historyCount} completed/dismissed</span> : null}
            </span>
            <div className="notes-view-toggle" role="group" aria-label="Reminder view">
              <IconButton
                className="notes-view-button"
                label="Grid view"
                aria-pressed={viewMode === 'grid'}
                data-active={viewMode === 'grid'}
                onClick={() => handleViewMode('grid')}
              >
                <LayoutGrid />
              </IconButton>
              <IconButton
                className="notes-view-button"
                label="List view"
                aria-pressed={viewMode === 'list'}
                data-active={viewMode === 'list'}
                onClick={() => handleViewMode('list')}
              >
                <Rows3 />
              </IconButton>
            </div>
          </div>

          <ReminderSection title="Overdue" notes={groups.overdue} {...sectionProps()} />
          <ReminderSection title="Today" notes={groups.today} {...sectionProps()} />
          <ReminderSection title="Tomorrow" notes={groups.tomorrow} {...sectionProps()} />
          <ReminderSection title="Next 7 days" notes={groups.nextSevenDays} {...sectionProps()} />
          <ReminderSection title="Later" notes={groups.later} {...sectionProps()} />
          <ReminderSection
            title="Completed & dismissed"
            notes={groups.history}
            {...sectionProps()}
          />
        </div>
      ) : collection.loaded ? (
        <section className="empty-state" aria-labelledby="empty-reminders-title">
          <span className="empty-state-icon" aria-hidden="true">
            <Bell />
          </span>
          <h2 id="empty-reminders-title">No reminders yet</h2>
          <p>Open any note or checklist and add a date and time.</p>
        </section>
      ) : null}

      {editingNote ? (
        <Suspense
          fallback={
            <span className="deferred-note-surface" role="status">
              Opening note…
            </span>
          }
        >
          {editingNote.type === 'checklist' ? (
            <ChecklistEditorDialog
              key={editingNote.id}
              note={editingNote}
              items={collection.checklistItemsByNote[editingNote.id] ?? []}
              repository={checklistsRepository}
              attachmentsRepository={attachmentsRepository}
              attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}
              onSaved={handleChecklistSaved}
              onAttachmentsChanged={handleAttachmentsChanged}
              onConverted={() => void reload()}
              onClose={() => setEditingNoteId(null)}
            />
          ) : (
            <NoteEditorDialog
              key={editingNote.id}
              note={editingNote}
              repository={notesRepository}
              attachmentsRepository={attachmentsRepository}
              attachmentRefreshKey={attachmentRefreshByNote[editingNote.id] ?? 0}
              onSaved={handleSaved}
              onAttachmentsChanged={handleAttachmentsChanged}
              onHistoryChecklistSaved={handleChecklistSaved}
              onConvertToChecklist={async () => {
                const converted = await checklistsRepository.convertTextToChecklist(editingNote.id);
                setEditingNoteId(converted.note.id);
                await reload();
              }}
              onClose={() => setEditingNoteId(null)}
            />
          )}
        </Suspense>
      ) : null}

      {toast ? (
        <LifecycleToast
          toast={toast}
          onUndo={() => {
            const undo = toast.undo;
            setToast(null);
            if (undo) void undo().catch(() => showToast('Undo could not be completed.'));
          }}
        />
      ) : null}
    </>
  );

  function sectionProps() {
    return {
      viewMode,
      actions,
      labels,
      labelIdsByNote: collection.labelIdsByNote,
      checklistItemsByNote: collection.checklistItemsByNote,
      remindersByNote: collection.remindersByNote,
      attachmentRefreshByNote,
    };
  }
}

function ReminderSection({
  title,
  notes,
  viewMode,
  actions,
  labels,
  labelIdsByNote,
  checklistItemsByNote,
  remindersByNote,
  attachmentRefreshByNote,
}: {
  title: string;
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  remindersByNote: Record<string, ReminderRecord>;
  attachmentRefreshByNote: Record<string, number>;
}) {
  if (notes.length === 0) return null;
  return (
    <section className="note-section reminder-section" aria-label={`${title} reminders`}>
      <h2 className="note-section-title">
        {title}
        <span className="reminder-section-count" aria-hidden="true">
          {notes.length}
        </span>
      </h2>
      <MasonryGrid
        notes={notes}
        viewMode={viewMode}
        ariaLabel={`${title} reminders`}
        mode="reminders"
        actions={actions}
        labels={labels}
        labelIdsByNote={labelIdsByNote}
        checklistItemsByNote={checklistItemsByNote}
        remindersByNote={remindersByNote}
        attachmentRefreshByNote={attachmentRefreshByNote}
      />
    </section>
  );
}

async function setColor(
  note: NoteRecord,
  color: NoteColor,
  reload: () => Promise<void>,
  showToast: (message: string) => void,
): Promise<void> {
  if (note.color === color) return;
  try {
    await notesRepository.update(note.id, { color }, note.revision);
    await reload();
  } catch {
    showToast('Note color could not be changed.');
  }
}

async function setLabels(
  note: NoteRecord,
  labelIds: string[],
  reload: () => Promise<void>,
  showToast: (message: string) => void,
): Promise<void> {
  try {
    await labelsRepository.setForNote(note.id, labelIds);
    await reload();
  } catch {
    showToast('Note labels could not be changed.');
  }
}
