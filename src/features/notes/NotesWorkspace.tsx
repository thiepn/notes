import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, NotebookPen, Rows3 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { NotesRepository, notesDatabase, type NoteRecord } from '../../db';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { clearEditorJournal, readEditorJournal } from './editorJournal';
import { LifecycleToast, type LifecycleToastState } from './LifecycleToast';
import { MasonryGrid } from './MasonryGrid';
import { type NoteCardActions, type NoteCollectionMode } from './NoteCard';
import { NoteEditorDialog } from './NoteEditorDialog';
import { TextNoteComposer } from './TextNoteComposer';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from './viewMode';

const notesRepository = new NotesRepository(notesDatabase);

interface NotesWorkspaceProps {
  mode?: NoteCollectionMode;
}

interface CollectionState {
  mode: NoteCollectionMode;
  notes: NoteRecord[];
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

export function NotesWorkspace({ mode = 'notes' }: NotesWorkspaceProps) {
  const [initialEditorNoteId] = useState(() => readEditorJournal()?.noteId ?? null);
  const recoveryEditorNoteIdRef = useRef<string | null>(initialEditorNoteId);
  const [collection, setCollection] = useState<CollectionState>({
    mode,
    notes: [],
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
    const storedNotes = await listNotesForMode(mode);
    setCollection({ mode, notes: storedNotes, loaded: true });
  }, [mode]);

  useEffect(() => {
    let cancelled = false;

    void listNotesForMode(mode)
      .then((storedNotes) => {
        if (cancelled) return;

        setCollection({ mode, notes: storedNotes, loaded: true });
        setToast(null);

        const recoveryNoteId = recoveryEditorNoteIdRef.current;
        if (recoveryNoteId === null) return;

        recoveryEditorNoteIdRef.current = null;
        if (mode !== 'trash' && storedNotes.some((note) => note.id === recoveryNoteId)) {
          setEditingNoteId(recoveryNoteId);
        } else {
          clearEditorJournal();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCollection({ mode, notes: [], loaded: true });
        showToast('Notes could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, [mode, showToast]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const notes = collection.mode === mode ? collection.notes : [];
  const loaded = collection.mode === mode && collection.loaded;

  const handleSaved = useCallback(
    (note: NoteRecord) => {
      setCollection((current) => {
        if (current.mode !== mode) return current;
        const nextNotes = [note, ...current.notes.filter((item) => item.id !== note.id)];
        return { ...current, notes: sortNotesForMode(nextNotes, mode) };
      });
    },
    [mode],
  );

  const handleRemoved = useCallback(
    (noteId: string) => {
      setCollection((current) => {
        if (current.mode !== mode) return current;
        return { ...current, notes: current.notes.filter((note) => note.id !== noteId) };
      });
    },
    [mode],
  );

  const handleViewMode = useCallback((nextMode: NotesViewMode) => {
    setViewMode(nextMode);
    writeNotesViewMode(nextMode);
  }, []);

  const handleTogglePin = useCallback(
    async (note: NoteRecord) => {
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
    },
    [refreshCollection, showToast],
  );

  const handleArchive = useCallback(
    async (note: NoteRecord) => {
      const wasPinned = note.pinnedAt !== null;
      try {
        await notesRepository.archive(note.id, note.revision);
        await refreshCollection();
        showToast('Note archived.', async () => {
          let restored = await notesRepository.unarchive(note.id);
          if (wasPinned) {
            restored = await notesRepository.setPinned(note.id, true, restored.revision);
          }
          await refreshCollection();
        });
      } catch {
        showToast('Note could not be archived.');
      }
    },
    [refreshCollection, showToast],
  );

  const handleUnarchive = useCallback(
    async (note: NoteRecord) => {
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
    },
    [refreshCollection, showToast],
  );

  const handleTrash = useCallback(
    async (note: NoteRecord) => {
      const wasArchived = note.archivedAt !== null;
      const wasPinned = note.pinnedAt !== null;

      try {
        await notesRepository.trash(note.id, note.revision);
        await refreshCollection();
        showToast('Note moved to trash.', async () => {
          let restored = await notesRepository.restore(note.id);
          if (wasArchived) {
            restored = await notesRepository.archive(note.id, restored.revision);
          } else if (wasPinned) {
            restored = await notesRepository.setPinned(note.id, true, restored.revision);
          }
          await refreshCollection();
        });
      } catch {
        showToast('Note could not be moved to trash.');
      }
    },
    [refreshCollection, showToast],
  );

  const handleRestore = useCallback(
    async (note: NoteRecord) => {
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
    },
    [refreshCollection, showToast],
  );

  const handleDuplicate = useCallback(
    async (note: NoteRecord) => {
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
    },
    [mode, refreshCollection, showToast],
  );

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

  const actions = useMemo<NoteCardActions>(
    () => ({
      open: (note) => setEditingNoteId(note.id),
      togglePin: (note) => void handleTogglePin(note),
      archive: (note) => void handleArchive(note),
      unarchive: (note) => void handleUnarchive(note),
      trash: (note) => void handleTrash(note),
      restore: (note) => void handleRestore(note),
      duplicate: (note) => void handleDuplicate(note),
      deletePermanently: (note) => setDeleteCandidate(note),
    }),
    [handleArchive, handleDuplicate, handleRestore, handleTogglePin, handleTrash, handleUnarchive],
  );

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
  const emptyCopy = EMPTY_COPY[mode];

  return (
    <>
      {mode === 'notes' ? (
        <TextNoteComposer
          repository={notesRepository}
          onSaved={handleSaved}
          onRemoved={handleRemoved}
          onActiveNoteChange={setActiveCaptureNoteId}
        />
      ) : null}

      {visibleNotes.length > 0 ? (
        <div className="notes-board" data-view={viewMode} data-mode={mode}>
          <div className="notes-toolbar">
            <span className="notes-count">
              {visibleNotes.length} {visibleNotes.length === 1 ? 'note' : 'notes'}
            </span>

            <div className="notes-view-toggle" role="group" aria-label="Note view">
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

          {pinnedNotes.length > 0 ? (
            <NoteSection
              title="Pinned"
              notes={pinnedNotes}
              viewMode={viewMode}
              mode={mode}
              actions={actions}
            />
          ) : null}

          {otherNotes.length > 0 ? (
            <NoteSection
              title={pinnedNotes.length > 0 ? 'Others' : null}
              notes={otherNotes}
              viewMode={viewMode}
              mode={mode}
              actions={actions}
            />
          ) : null}
        </div>
      ) : loaded ? (
        <section className="empty-state" aria-labelledby={`empty-${mode}-title`}>
          <span className="empty-state-icon" aria-hidden="true">
            <NotebookPen />
          </span>
          <h2 id={`empty-${mode}-title`}>{emptyCopy.title}</h2>
          <p>{emptyCopy.description}</p>
        </section>
      ) : null}

      {editingNote && mode !== 'trash' ? (
        <NoteEditorDialog
          key={editingNote.id}
          note={editingNote}
          repository={notesRepository}
          onSaved={handleSaved}
          onClose={() => setEditingNoteId(null)}
        />
      ) : null}

      {toast ? <LifecycleToast toast={toast} onUndo={handleUndo} /> : null}

      {deleteCandidate ? (
        <ConfirmDeleteDialog
          title={deleteCandidate.title}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </>
  );
}

function NoteSection({
  title,
  notes,
  viewMode,
  mode,
  actions,
}: {
  title: string | null;
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  mode: NoteCollectionMode;
  actions: NoteCardActions;
}) {
  const ariaLabel =
    title !== null
      ? `${title} notes`
      : mode === 'archive'
        ? 'Archived notes'
        : mode === 'trash'
          ? 'Trashed notes'
          : 'Saved notes';

  return (
    <section className="note-section" aria-label={title ?? 'Notes'}>
      {title ? <h2 className="note-section-title">{title}</h2> : null}
      <MasonryGrid
        notes={notes}
        viewMode={viewMode}
        ariaLabel={ariaLabel}
        mode={mode}
        actions={actions}
      />
    </section>
  );
}

async function listNotesForMode(mode: NoteCollectionMode): Promise<NoteRecord[]> {
  if (mode === 'archive') return notesRepository.listArchived();
  if (mode === 'trash') return notesRepository.listTrashed();
  return notesRepository.listActive();
}

function sortNotesForMode(notes: NoteRecord[], mode: NoteCollectionMode): NoteRecord[] {
  if (mode === 'archive') {
    return [...notes].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  }

  if (mode === 'trash') {
    return [...notes].sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  }

  return [...notes].sort((a, b) => {
    const aPinned = a.pinnedAt !== null;
    const bPinned = b.pinnedAt !== null;

    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && a.pinnedAt !== b.pinnedAt) {
      return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
    }

    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
  });
}
