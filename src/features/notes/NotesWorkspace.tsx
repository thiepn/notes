import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, NotebookPen, Rows3 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import {
  ChecklistsRepository,
  LabelsRepository,
  NotesRepository,
  notesDatabase,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteColor,
  type NoteRecord,
} from '../../db';
import { ChecklistComposer } from './ChecklistComposer';
import { ChecklistEditorDialog } from './ChecklistEditorDialog';
import {
  clearChecklistEditorJournal,
  readChecklistCaptureJournal,
  readChecklistEditorJournal,
} from './checklistJournal';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { clearEditorJournal, readEditorJournal } from './editorJournal';
import { LifecycleToast, type LifecycleToastState } from './LifecycleToast';
import { MasonryGrid } from './MasonryGrid';
import { type NoteCardActions, type NoteCollectionMode } from './NoteCard';
import { NoteEditorDialog } from './NoteEditorDialog';
import { TextNoteComposer } from './TextNoteComposer';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from './viewMode';

const notesRepository = new NotesRepository(notesDatabase);
const labelsRepository = new LabelsRepository(notesDatabase);
const checklistsRepository = new ChecklistsRepository(notesDatabase);
const EMPTY_NOTES: NoteRecord[] = [];
const EMPTY_LABEL_MAP: Record<string, string[]> = {};
const EMPTY_CHECKLIST_MAP: Record<string, ChecklistItemRecord[]> = {};

interface NotesWorkspaceProps {
  mode?: NoteCollectionMode;
  labels: LabelRecord[];
  filterLabelId?: string | null;
}

interface CollectionState {
  mode: NoteCollectionMode;
  filterLabelId: string | null;
  notes: NoteRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
  loaded: boolean;
}

const EMPTY_COPY: Record<NoteCollectionMode, { title: string; description: string }> = {
  notes: {
    title: 'Your notes will appear here',
    description: 'Create a note to keep thoughts, lists, and useful details close at hand.',
  },
  archive: {
    title: 'Your archive is empty',
    description: 'Archived notes stay out of the way while remaining available here.',
  },
  trash: {
    title: 'Trash is empty',
    description: 'Notes you move to trash will appear here until you restore or delete them.',
  },
};

export function NotesWorkspace({ mode = 'notes', labels, filterLabelId = null }: NotesWorkspaceProps) {
  const [initialEditorNoteId] = useState(
    () => readEditorJournal()?.noteId ?? readChecklistEditorJournal()?.noteId ?? null,
  );
  const recoveryEditorNoteIdRef = useRef<string | null>(initialEditorNoteId);
  const [checklistCaptureOpen, setChecklistCaptureOpen] = useState(() =>
    Boolean(readChecklistCaptureJournal()),
  );
  const [collection, setCollection] = useState<CollectionState>({
    mode,
    filterLabelId,
    notes: [],
    labelIdsByNote: {},
    checklistItemsByNote: {},
    loaded: false,
  });
  const [activeCaptureNoteId, setActiveCaptureNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());
  const [toast, setToast] = useState<LifecycleToastState | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<NoteRecord | null>(null);

  const showToast = useCallback((message: string, undo?: () => Promise<void>) => {
    const id = crypto.randomUUID();
    setToast(undo ? { id, message, undo } : { id, message });
  }, []);

  const refreshCollection = useCallback(async () => {
    const loadedCollection = await loadCollection(mode, filterLabelId);
    setCollection({ mode, filterLabelId, ...loadedCollection, loaded: true });
  }, [filterLabelId, mode]);

  useEffect(() => {
    let cancelled = false;
    void loadCollection(mode, filterLabelId)
      .then((loadedCollection) => {
        if (cancelled) return;
        setCollection({ mode, filterLabelId, ...loadedCollection, loaded: true });
        setToast(null);

        const recoveryNoteId = recoveryEditorNoteIdRef.current;
        if (recoveryNoteId === null) return;
        recoveryEditorNoteIdRef.current = null;
        if (mode !== 'trash' && loadedCollection.notes.some((note) => note.id === recoveryNoteId)) {
          setEditingNoteId(recoveryNoteId);
        } else {
          clearEditorJournal();
          clearChecklistEditorJournal();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCollection({
          mode,
          filterLabelId,
          notes: [],
          labelIdsByNote: {},
          checklistItemsByNote: {},
          loaded: true,
        });
        showToast('Notes could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [filterLabelId, mode, showToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const matchesCollection = collection.mode === mode && collection.filterLabelId === filterLabelId;
  const notes = matchesCollection ? collection.notes : EMPTY_NOTES;
  const labelIdsByNote = matchesCollection ? collection.labelIdsByNote : EMPTY_LABEL_MAP;
  const checklistItemsByNote = matchesCollection
    ? collection.checklistItemsByNote
    : EMPTY_CHECKLIST_MAP;
  const loaded = matchesCollection && collection.loaded;

  const prepareCapturedNote = useCallback(
    async (note: NoteRecord) => {
      if (filterLabelId) await labelsRepository.assign(note.id, filterLabelId);
    },
    [filterLabelId],
  );

  const handleSaved = useCallback(
    (note: NoteRecord) => {
      setCollection((current) => {
        if (current.mode !== mode || current.filterLabelId !== filterLabelId) return current;
        const currentLabelIds = current.labelIdsByNote[note.id] ?? [];
        const nextLabelIds = filterLabelId
          ? [...new Set([...currentLabelIds, filterLabelId])]
          : currentLabelIds;
        const nextNotes = [note, ...current.notes.filter((item) => item.id !== note.id)];
        return {
          ...current,
          notes: sortNotesForMode(nextNotes, mode),
          labelIdsByNote: { ...current.labelIdsByNote, [note.id]: nextLabelIds },
        };
      });
    },
    [filterLabelId, mode],
  );

  const handleChecklistSaved = useCallback(
    (note: NoteRecord, items: ChecklistItemRecord[]) => {
      handleSaved(note);
      setCollection((current) => {
        if (current.mode !== mode || current.filterLabelId !== filterLabelId) return current;
        return {
          ...current,
          checklistItemsByNote: { ...current.checklistItemsByNote, [note.id]: items },
        };
      });
    },
    [filterLabelId, handleSaved, mode],
  );

  const handleRemoved = useCallback(
    (noteId: string) => {
      setCollection((current) => {
        if (current.mode !== mode || current.filterLabelId !== filterLabelId) return current;
        const nextLabelIdsByNote = { ...current.labelIdsByNote };
        const nextChecklistItemsByNote = { ...current.checklistItemsByNote };
        delete nextLabelIdsByNote[noteId];
        delete nextChecklistItemsByNote[noteId];
        return {
          ...current,
          notes: current.notes.filter((note) => note.id !== noteId),
          labelIdsByNote: nextLabelIdsByNote,
          checklistItemsByNote: nextChecklistItemsByNote,
        };
      });
    },
    [filterLabelId, mode],
  );

  const handleConvertedToText = useCallback(
    (note: NoteRecord) => {
      handleSaved(note);
      setCollection((current) => {
        const next = { ...current.checklistItemsByNote };
        delete next[note.id];
        return { ...current, checklistItemsByNote: next };
      });
    },
    [handleSaved],
  );

  const handleViewMode = useCallback((nextMode: NotesViewMode) => {
    setViewMode(nextMode);
    writeNotesViewMode(nextMode);
  }, []);

  const handleTogglePin = useCallback(async (note: NoteRecord) => {
    const wasPinned = note.pinnedAt !== null;
    try {
      await notesRepository.setPinned(note.id, !wasPinned, note.revision);
      await refreshCollection();
      showToast(wasPinned ? 'Note unpinned.' : 'Note pinned.', async () => {
        await notesRepository.setPinned(note.id, wasPinned);
        await refreshCollection();
      });
    } catch {
      showToast('Pin state could not be changed.');
    }
  }, [refreshCollection, showToast]);

  const handleArchive = useCallback(async (note: NoteRecord) => {
    const wasPinned = note.pinnedAt !== null;
    try {
      await notesRepository.archive(note.id, note.revision);
      await refreshCollection();
      showToast('Note archived.', async () => {
        const restored = await notesRepository.unarchive(note.id);
        if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
        await refreshCollection();
      });
    } catch {
      showToast('Note could not be archived.');
    }
  }, [refreshCollection, showToast]);

  const handleUnarchive = useCallback(async (note: NoteRecord) => {
    try {
      await notesRepository.unarchive(note.id, note.revision);
      await refreshCollection();
      showToast('Note moved to Notes.', async () => {
        await notesRepository.archive(note.id);
        await refreshCollection();
      });
    } catch {
      showToast('Note could not be unarchived.');
    }
  }, [refreshCollection, showToast]);

  const handleTrash = useCallback(async (note: NoteRecord) => {
    const wasArchived = note.archivedAt !== null;
    const wasPinned = note.pinnedAt !== null;
    try {
      await notesRepository.trash(note.id, note.revision);
      await refreshCollection();
      showToast('Note moved to trash.', async () => {
        const restored = await notesRepository.restore(note.id);
        if (wasArchived) await notesRepository.archive(note.id, restored.revision);
        else if (wasPinned) await notesRepository.setPinned(note.id, true, restored.revision);
        await refreshCollection();
      });
    } catch {
      showToast('Note could not be moved to trash.');
    }
  }, [refreshCollection, showToast]);

  const handleRestore = useCallback(async (note: NoteRecord) => {
    try {
      await notesRepository.restore(note.id, note.revision);
      await refreshCollection();
      showToast('Note restored to Notes.', async () => {
        await notesRepository.trash(note.id);
        await refreshCollection();
      });
    } catch {
      showToast('Note could not be restored.');
    }
  }, [refreshCollection, showToast]);

  const handleDuplicate = useCallback(async (note: NoteRecord) => {
    try {
      const duplicate = await notesRepository.duplicate(note.id);
      await refreshCollection();
      showToast(mode === 'notes' ? 'Note duplicated.' : 'Copy created in Notes.', async () => {
        await notesRepository.deletePermanently(duplicate.id);
        await refreshCollection();
      });
    } catch {
      showToast('Note could not be duplicated.');
    }
  }, [mode, refreshCollection, showToast]);

  const handleSetColor = useCallback(async (note: NoteRecord, color: NoteColor) => {
    if (note.color === color) return;
    const previousColor = note.color;
    try {
      const saved = await notesRepository.update(note.id, { color }, note.revision);
      handleSaved(saved);
      showToast('Color changed.', async () => {
        await notesRepository.update(note.id, { color: previousColor });
        await refreshCollection();
      });
    } catch {
      showToast('Note color could not be changed.');
    }
  }, [handleSaved, refreshCollection, showToast]);

  const handleSetLabels = useCallback(async (note: NoteRecord, labelIds: string[]) => {
    const previousLabelIds = labelIdsByNote[note.id] ?? [];
    if (sameStringSet(previousLabelIds, labelIds)) return;
    try {
      await labelsRepository.setForNote(note.id, labelIds);
      await refreshCollection();
      showToast('Labels updated.', async () => {
        await labelsRepository.setForNote(note.id, previousLabelIds);
        await refreshCollection();
      });
    } catch {
      showToast('Note labels could not be changed.');
    }
  }, [labelIdsByNote, refreshCollection, showToast]);

  const handleConfirmDelete = useCallback(async () => {
    const note = deleteCandidate;
    if (!note) return;
    setDeleteCandidate(null);
    try {
      await notesRepository.deletePermanently(note.id);
      await refreshCollection();
      showToast('Note deleted permanently.');
    } catch {
      showToast('Note could not be deleted.');
    }
  }, [deleteCandidate, refreshCollection, showToast]);

  const handleUndo = useCallback(() => {
    const undo = toast?.undo;
    if (!undo) return;
    setToast(null);
    void undo().catch(() => showToast('Undo could not be completed.'));
  }, [showToast, toast]);

  const actions = useMemo<NoteCardActions>(() => ({
    open: (note) => setEditingNoteId(note.id),
    togglePin: (note) => void handleTogglePin(note),
    archive: (note) => void handleArchive(note),
    unarchive: (note) => void handleUnarchive(note),
    trash: (note) => void handleTrash(note),
    restore: (note) => void handleRestore(note),
    duplicate: (note) => void handleDuplicate(note),
    deletePermanently: (note) => setDeleteCandidate(note),
    setColor: (note, color) => void handleSetColor(note, color),
    setLabels: (note, labelIds) => void handleSetLabels(note, labelIds),
  }), [handleArchive, handleDuplicate, handleRestore, handleSetColor, handleSetLabels, handleTogglePin, handleTrash, handleUnarchive]);

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.id !== activeCaptureNoteId),
    [activeCaptureNoteId, notes],
  );
  const pinnedNotes = useMemo(
    () => (mode === 'notes' ? visibleNotes.filter((note) => note.pinnedAt !== null) : []),
    [mode, visibleNotes],
  );
  const otherNotes = useMemo(
    () => (mode === 'notes' ? visibleNotes.filter((note) => note.pinnedAt === null) : visibleNotes),
    [mode, visibleNotes],
  );
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;
  const emptyCopy = filterLabelId
    ? { title: 'No notes with this label', description: 'Create a note here or add this label to an existing note.' }
    : EMPTY_COPY[mode];

  return (
    <>
      {mode === 'notes' ? (
        checklistCaptureOpen ? (
          <ChecklistComposer
            repository={checklistsRepository}
            notesRepository={notesRepository}
            beforeSaved={prepareCapturedNote}
            onSaved={handleChecklistSaved}
            onRemoved={handleRemoved}
            onActiveNoteChange={setActiveCaptureNoteId}
            onFinished={() => setChecklistCaptureOpen(false)}
          />
        ) : (
          <TextNoteComposer
            repository={notesRepository}
            beforeSaved={prepareCapturedNote}
            onSaved={handleSaved}
            onRemoved={handleRemoved}
            onActiveNoteChange={setActiveCaptureNoteId}
            onChecklistRequested={() => setChecklistCaptureOpen(true)}
          />
        )
      ) : null}

      {visibleNotes.length > 0 ? (
        <div className="notes-board" data-view={viewMode} data-mode={mode}>
          <div className="notes-toolbar">
            <span className="notes-count">{visibleNotes.length} {visibleNotes.length === 1 ? 'note' : 'notes'}</span>
            <div className="notes-view-toggle" role="group" aria-label="Note view">
              <IconButton className="notes-view-button" label="Grid view" aria-pressed={viewMode === 'grid'} data-active={viewMode === 'grid'} onClick={() => handleViewMode('grid')}>
                <LayoutGrid />
              </IconButton>
              <IconButton className="notes-view-button" label="List view" aria-pressed={viewMode === 'list'} data-active={viewMode === 'list'} onClick={() => handleViewMode('list')}>
                <Rows3 />
              </IconButton>
            </div>
          </div>

          {pinnedNotes.length > 0 ? (
            <NoteSection title="Pinned" notes={pinnedNotes} viewMode={viewMode} mode={mode} actions={actions} labels={labels} labelIdsByNote={labelIdsByNote} checklistItemsByNote={checklistItemsByNote} />
          ) : null}
          {otherNotes.length > 0 ? (
            <NoteSection title={pinnedNotes.length > 0 ? 'Others' : null} notes={otherNotes} viewMode={viewMode} mode={mode} actions={actions} labels={labels} labelIdsByNote={labelIdsByNote} checklistItemsByNote={checklistItemsByNote} />
          ) : null}
        </div>
      ) : loaded ? (
        <section className="empty-state" aria-labelledby={`empty-${mode}-title`}>
          <span className="empty-state-icon" aria-hidden="true"><NotebookPen /></span>
          <h2 id={`empty-${mode}-title`}>{emptyCopy.title}</h2>
          <p>{emptyCopy.description}</p>
        </section>
      ) : null}

      {editingNote && mode !== 'trash' ? (
        editingNote.type === 'checklist' ? (
          <ChecklistEditorDialog
            key={editingNote.id}
            note={editingNote}
            items={checklistItemsByNote[editingNote.id] ?? []}
            repository={checklistsRepository}
            onSaved={handleChecklistSaved}
            onConverted={handleConvertedToText}
            onClose={() => setEditingNoteId(null)}
          />
        ) : (
          <NoteEditorDialog
            key={editingNote.id}
            note={editingNote}
            repository={notesRepository}
            onSaved={handleSaved}
            onConvertToChecklist={async () => {
              try {
                const converted = await checklistsRepository.convertTextToChecklist(editingNote.id);
                handleChecklistSaved(converted.note, converted.items);
                setEditingNoteId(converted.note.id);
              } catch {
                showToast('Note could not be converted to a checklist.');
              }
            }}
            onClose={() => setEditingNoteId(null)}
          />
        )
      ) : null}

      {toast ? <LifecycleToast toast={toast} onUndo={handleUndo} /> : null}
      {deleteCandidate ? (
        <ConfirmDeleteDialog title={deleteCandidate.title} onCancel={() => setDeleteCandidate(null)} onConfirm={() => void handleConfirmDelete()} />
      ) : null}
    </>
  );
}

function NoteSection({ title, notes, viewMode, mode, actions, labels, labelIdsByNote, checklistItemsByNote }: {
  title: string | null;
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
  labels: LabelRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
}) {
  const ariaLabel = title !== null ? `${title} notes` : mode === 'archive' ? 'Archived notes' : mode === 'trash' ? 'Trashed notes' : 'Saved notes';
  return (
    <section className="note-section" aria-label={title ?? 'Notes'}>
      {title ? <h2 className="note-section-title">{title}</h2> : null}
      <MasonryGrid notes={notes} viewMode={viewMode} ariaLabel={ariaLabel} mode={mode} actions={actions} labels={labels} labelIdsByNote={labelIdsByNote} checklistItemsByNote={checklistItemsByNote} />
    </section>
  );
}

async function loadCollection(mode: NoteCollectionMode, filterLabelId: string | null): Promise<{
  notes: NoteRecord[];
  labelIdsByNote: Record<string, string[]>;
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>;
}> {
  const notes = await listNotesForMode(mode, filterLabelId);
  const noteIds = notes.map((note) => note.id);
  const checklistNoteIds = notes.filter((note) => note.type === 'checklist').map((note) => note.id);
  const [labelIdsByNote, checklistItemsByNote] = await Promise.all([
    labelsRepository.labelIdsByNote(noteIds),
    checklistsRepository.itemsByNote(checklistNoteIds),
  ]);
  return { notes, labelIdsByNote, checklistItemsByNote };
}

async function listNotesForMode(mode: NoteCollectionMode, filterLabelId: string | null): Promise<NoteRecord[]> {
  if (mode === 'archive') return notesRepository.listArchived();
  if (mode === 'trash') return notesRepository.listTrashed();
  if (!filterLabelId) return notesRepository.listActive();
  const [activeNotes, labeledNoteIds] = await Promise.all([
    notesRepository.listActive(),
    labelsRepository.noteIdsForLabel(filterLabelId),
  ]);
  const labeled = new Set(labeledNoteIds);
  return activeNotes.filter((note) => labeled.has(note.id));
}

function sortNotesForMode(notes: NoteRecord[], mode: NoteCollectionMode): NoteRecord[] {
  if (mode === 'archive') return [...notes].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  if (mode === 'trash') return [...notes].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  return [...notes].sort((a, b) => {
    const aPinned = a.pinnedAt !== null;
    const bPinned = b.pinnedAt !== null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && a.pinnedAt !== b.pinnedAt) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
  });
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const values = new Set(a);
  return b.every((value) => values.has(value));
}
