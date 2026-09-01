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
  RemindersRepository,
  RevisionsRepository,
  notesDatabase,
  type AttachmentsRepository,
  type ChecklistItemRecord,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { ReminderControl } from '../reminders/ReminderControl';
import { RichTextEditor } from '../richText/RichTextEditor';
import { AttachmentPanel } from './AttachmentPanel';
import { RevisionHistoryDialog } from './RevisionHistoryDialog';
import { useExistingNoteEditor } from './useExistingNoteEditor';

const revisionsRepository = new RevisionsRepository(notesDatabase);
const remindersRepository = new RemindersRepository(notesDatabase);

interface HistoricalResult {
  note: NoteRecord;
  items: ChecklistItemRecord[];
}

interface NoteEditorDialogProps {
  note: NoteRecord;
  repository: NotesRepository;
  attachmentsRepository: AttachmentsRepository;
  attachmentRefreshKey?: number;
  onSaved(note: NoteRecord): void;
  onAttachmentsChanged(noteId: string): void;
  onHistoryChecklistSaved(note: NoteRecord, items: ChecklistItemRecord[]): void;
  onConvertToChecklist(): Promise<void>;
  onClose(): void;
}

export function NoteEditorDialog({
  note,
  repository,
  attachmentsRepository,
  attachmentRefreshKey = 0,
  onSaved,
  onAttachmentsChanged,
  onHistoryChecklistSaved,
  onConvertToChecklist,
  onClose,
}: NoteEditorDialogProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [historyNote, setHistoryNote] = useState<NoteRecord | null>(null);
  const [pendingHistoryResult, setPendingHistoryResult] = useState<HistoricalResult | null>(null);
  const [pendingHistoryCopies, setPendingHistoryCopies] = useState<HistoricalResult[]>([]);
  const { draft, errorMessage, status, setTitle, setContent, saveNow, finishEditing, retrySave } =
    useExistingNoteEditor({
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
    if (!saved) return;
    await onConvertToChecklist();
    const converted = await repository.require(note.id);
    if (converted.type === 'checklist') {
      await revisionsRepository.checkpoint(converted.id, 'conversion');
    }
  };

  const surfaceHistoricalResult = (result: HistoricalResult) => {
    if (result.note.type === 'checklist') {
      onHistoryChecklistSaved(result.note, result.items);
    } else {
      onSaved(result.note);
    }
  };

  const openHistory = async () => {
    const saved = await saveNow();
    if (!saved) return;
    await revisionsRepository.checkpoint(saved.id, 'close');
    setHistoryNote(saved);
    setPendingHistoryResult(null);
    setPendingHistoryCopies([]);
  };

  const closeHistory = () => {
    const result = pendingHistoryResult;
    const copies = pendingHistoryCopies;
    setHistoryNote(null);
    setPendingHistoryResult(null);
    setPendingHistoryCopies([]);

    for (const copy of copies) surfaceHistoricalResult(copy);
    if (result) surfaceHistoricalResult(result);
    if (result || copies.length > 0) onClose();
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
          <RichTextEditor
            textareaRef={bodyRef}
            className="note-editor-body"
            value={draft.content}
            ariaLabel="Edit note text"
            placeholder="Take a note…"
            rows={1}
            autoFocus
            onChange={setContent}
          />

          <ReminderControl
            noteId={note.id}
            repository={remindersRepository}
            onChanged={() => undefined}
          />

          <AttachmentPanel
            noteId={note.id}
            repository={attachmentsRepository}
            refreshKey={attachmentRefreshKey}
            onChanged={onAttachmentsChanged}
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
              <button
                className="note-editor-secondary"
                type="button"
                onClick={() => void convert()}
              >
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
            setPendingHistoryResult(result);
            setHistoryNote(result.note);
          }}
          onCopied={(result) => {
            if (note.archivedAt === null && note.trashedAt === null) {
              setPendingHistoryCopies((current) => [...current, result]);
            }
          }}
        />
      ) : null}
    </>
  );
}
