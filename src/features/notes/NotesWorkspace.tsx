import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, NotebookPen, Rows3 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import { NotesRepository, notesDatabase, type NoteRecord } from '../../db';
import { clearEditorJournal, readEditorJournal } from './editorJournal';
import { MasonryGrid } from './MasonryGrid';
import { NoteEditorDialog } from './NoteEditorDialog';
import { TextNoteComposer } from './TextNoteComposer';
import { readNotesViewMode, writeNotesViewMode, type NotesViewMode } from './viewMode';

const notesRepository = new NotesRepository(notesDatabase);

export function NotesWorkspace() {
  const [initialEditorNoteId] = useState(() => readEditorJournal()?.noteId ?? null);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeCaptureNoteId, setActiveCaptureNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(initialEditorNoteId);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());

  useEffect(() => {
    let cancelled = false;

    void notesRepository
      .listActive()
      .then((storedNotes) => {
        if (cancelled) return;

        setNotes(storedNotes);
        if (initialEditorNoteId && !storedNotes.some((note) => note.id === initialEditorNoteId)) {
          clearEditorJournal();
          setEditingNoteId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initialEditorNoteId]);

  const handleSaved = useCallback((note: NoteRecord) => {
    setNotes((current) => sortNotes([note, ...current.filter((item) => item.id !== note.id)]));
  }, []);

  const handleRemoved = useCallback((noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  }, []);

  const handleViewMode = useCallback((mode: NotesViewMode) => {
    setViewMode(mode);
    writeNotesViewMode(mode);
  }, []);

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.id !== activeCaptureNoteId),
    [activeCaptureNoteId, notes],
  );
  const pinnedNotes = useMemo(
    () => visibleNotes.filter((note) => note.pinnedAt !== null),
    [visibleNotes],
  );
  const otherNotes = useMemo(
    () => visibleNotes.filter((note) => note.pinnedAt === null),
    [visibleNotes],
  );
  const editingNote = notes.find((note) => note.id === editingNoteId) ?? null;

  return (
    <>
      <TextNoteComposer
        repository={notesRepository}
        onSaved={handleSaved}
        onRemoved={handleRemoved}
        onActiveNoteChange={setActiveCaptureNoteId}
      />

      {visibleNotes.length > 0 ? (
        <div className="notes-board" data-view={viewMode}>
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
              onOpen={setEditingNoteId}
            />
          ) : null}

          {otherNotes.length > 0 ? (
            <NoteSection
              title={pinnedNotes.length > 0 ? 'Others' : null}
              notes={otherNotes}
              viewMode={viewMode}
              onOpen={setEditingNoteId}
            />
          ) : null}
        </div>
      ) : loaded ? (
        <section className="empty-state" aria-labelledby="empty-notes-title">
          <span className="empty-state-icon" aria-hidden="true">
            <NotebookPen />
          </span>
          <h2 id="empty-notes-title">Your notes will appear here</h2>
          <p>Create a note to keep thoughts, lists, and useful details close at hand.</p>
        </section>
      ) : null}

      {editingNote ? (
        <NoteEditorDialog
          key={editingNote.id}
          note={editingNote}
          repository={notesRepository}
          onSaved={handleSaved}
          onClose={() => setEditingNoteId(null)}
        />
      ) : null}
    </>
  );
}

function NoteSection({
  title,
  notes,
  viewMode,
  onOpen,
}: {
  title: string | null;
  notes: NoteRecord[];
  viewMode: NotesViewMode;
  onOpen(noteId: string): void;
}) {
  return (
    <section className="note-section" aria-label={title ?? 'Notes'}>
      {title ? <h2 className="note-section-title">{title}</h2> : null}
      <MasonryGrid
        notes={notes}
        viewMode={viewMode}
        ariaLabel={title ? `${title} notes` : 'Saved notes'}
        onOpen={onOpen}
      />
    </section>
  );
}

function sortNotes(notes: NoteRecord[]): NoteRecord[] {
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
