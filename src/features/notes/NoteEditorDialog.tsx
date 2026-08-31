import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { History } from 'lucide-react';

import {
  RevisionsRepository,
  notesDatabase,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { RevisionHistoryDialog } from './RevisionHistoryDialog';
import { useExistingNoteEditor } from './useExistingNoteEditor';

const revisionsRepository = new RevisionsRepository(notesDatabase);

interface NoteEditorDialogProps {
  note: NoteRecord;
  repository: NotesRepository;
  onSaved(note: NoteRecord): void;
  onConvertToChecklist(): Promise<void>;
  onClose(): void;
}

export function NoteEditorDialog({
  note,
  repository,
  onSaved,
  onConvertToChecklist,
  onClose,
}: NoteEditorDialogProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [historyNote, setHistoryNote] = useState<NoteRecord | null>(null);
  const [historyChanged, setHistoryChanged] = useState(false);
  const {
    draft,
    errorMessage,
    status,
    setTitle,
    setContent,
    saveNow,
    finishEditing,
    retrySave,
  } = useExistingNoteEditor({
    note,
    repository,
    onSaved,
    beforeClose: async (saved) => {
      await revisionsRepository.checkpoint(saved.id, 'close');
    },
    onClose,
  });

  useEffect(() => {
    void revisionsRepository.checkpoint(note.id, 'edit').catch(() => {
      // Editing remains available if history storage fails; opening History surfaces the error.
    });
  }, [note.id]);

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
    if (historyNote) return;
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
    if (historyNote || event.target !== event.currentTarget) return;
    void finishEditing();
  };

  const convert = async () => {
    const saved = await finishEditing();
    if (saved) await onConvertToChecklist();
  };

  const openHistory = async () => {
    const saved = await saveNow();
    if (!saved) return;
    await revisionsRepository.checkpoint(saved.id, 'close');
    setHistoryNote(saved);
    setHistoryChanged(false);
  };

  const closeHistory = () => {
    setHistoryNote(null);
    if (historyChanged) onClose();
  };

  return (
    <>
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
            <div className="note-editor-footer-actions">
              <button
                className="note-editor-secondary"
                type="button"
                onClick={() => void openHistory()}
              >
                <History aria-hidden="true" /> History
              </button>
              <button className="note-editor-secondary" type="button" onClick={() => void convert()}>
                Convert to checklist
              </button>
              <button
                className="note-editor-close"
                type="button"
                onClick={() => void finishEditing()}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {historyNote ? (
        <RevisionHistoryDialog
          note={historyNote}
          repository={revisionsRepository}
          onClose={closeHistory}
          onRestored={(result) => {
            onSaved(result.note);
            setHistoryNote(result.note);
            setHistoryChanged(true);
          }}
          onCopied={(result) => {
            if (note.archivedAt === null && note.trashedAt === null) onSaved(result.note);
          }}
        />
      ) : null}
    </>
  );
}