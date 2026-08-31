import { useCallback, useEffect, useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';

import { NotesRepository, notesDatabase, type NoteRecord } from '../../db';
import { TextNoteComposer } from './TextNoteComposer';

const notesRepository = new NotesRepository(notesDatabase);

export function NotesWorkspace() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void notesRepository
      .listActive()
      .then((storedNotes) => {
        if (!cancelled) setNotes(storedNotes);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaved = useCallback((note: NoteRecord) => {
    setNotes((current) => sortNotes([note, ...current.filter((item) => item.id !== note.id)]));
  }, []);

  const handleRemoved = useCallback((noteId: string) => {
    setNotes((current) => current.filter((note) => note.id !== noteId));
  }, []);

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.id !== activeNoteId),
    [activeNoteId, notes],
  );

  return (
    <>
      <TextNoteComposer
        repository={notesRepository}
        onSaved={handleSaved}
        onRemoved={handleRemoved}
        onActiveNoteChange={setActiveNoteId}
      />

      {visibleNotes.length > 0 ? (
        <section className="capture-note-list" aria-label="Saved notes">
          {visibleNotes.map((note) => (
            <article className="capture-note-preview" key={note.id} data-note-id={note.id}>
              {note.title ? <h2>{note.title}</h2> : null}
              {note.content ? <p>{note.content}</p> : null}
              {!note.title && !note.content ? <p className="capture-note-empty">Empty note</p> : null}
            </article>
          ))}
        </section>
      ) : loaded ? (
        <section className="empty-state" aria-labelledby="empty-notes-title">
          <span className="empty-state-icon" aria-hidden="true">
            <NotebookPen />
          </span>
          <h2 id="empty-notes-title">Your notes will appear here</h2>
          <p>Create a note to keep thoughts, lists, and useful details close at hand.</p>
        </section>
      ) : null}
    </>
  );
}

function sortNotes(notes: NoteRecord[]): NoteRecord[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}
