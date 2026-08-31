import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { NoteRecord, NotesRepository } from '../../db';
import { useExistingNoteEditor } from './useExistingNoteEditor';

interface NoteEditorDialogProps {
  note: NoteRecord;
  repository: NotesRepository;
  onSaved(note: NoteRecord): void;
  onClose(): void;
}

export function NoteEditorDialog({ note, repository, onSaved, onClose }: NoteEditorDialogProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { draft, errorMessage, status, setTitle, setContent, finishEditing, retrySave } =
    useExistingNoteEditor({ note, repository, onSaved, onClose });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useLayoutEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft.content]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void finishEditing();
      return;
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void finishEditing();
    }
  };

  const handleLayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    void finishEditing();
  };

  return (
    <div className="note-editor-layer" onPointerDown={handleLayerPointerDown}>
      <div
        className="note-editor-dialog"
        data-color={note.color}
        role="dialog"
        aria-modal="true"
        aria-label="Edit note"
        onKeyDown={handleKeyDown}
      >
        <input
          className="note-editor-title"
          type="text"
          value={draft.title}
          aria-label="Edit title"
          placeholder="Title"
          autoComplete="off"
          onChange={(event) => setTitle(event.target.value)}
        />

        <textarea
          ref={bodyRef}
          className="note-editor-body"
          value={draft.content}
          aria-label="Edit note text"
          placeholder="Take a note…"
          rows={1}
          autoFocus
          onChange={(event) => setContent(event.target.value)}
        />

        <div className="note-editor-footer">
          <div className="note-editor-state" aria-live="polite">
            {status === 'saving' ? <span>Saving…</span> : null}
            {errorMessage ? (
              <span className="note-editor-error" role="alert">
                {errorMessage}
                <button type="button" onClick={retrySave}>
                  Retry
                </button>
              </span>
            ) : null}
          </div>

          <button className="note-editor-close" type="button" onClick={() => void finishEditing()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
