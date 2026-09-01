import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { History, ListChecks, MoreHorizontal, Paperclip, Plus, Workflow } from 'lucide-react';

import {
  RemindersRepository,
  RevisionsRepository,
  VoiceAttachmentsRepository,
  notesDatabase,
  type AttachmentsRepository,
  type ChecklistItemRecord,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { DrawingAttachmentButton } from '../drawing/DrawingAttachmentButton';
import { ConnectionsPanel } from '../links/ConnectionsPanel';
import { resolveWikiLink } from '../links/linkIntelligence';
import { requestLinkedNoteOpen } from '../links/navigation';
import { appendOcrText } from '../ocr/ocr';
import { OcrAttachmentControl } from '../ocr/OcrAttachmentControl';
import { ReminderControl } from '../reminders/ReminderControl';
import { RichTextEditor } from '../richText/RichTextEditor';
import { VoiceAttachmentButton } from '../voice/VoiceAttachmentButton';
import { AttachmentPanel } from './AttachmentPanel';
import { RevisionHistoryDialog } from './RevisionHistoryDialog';
import { useExistingNoteEditor } from './useExistingNoteEditor';

const revisionsRepository = new RevisionsRepository(notesDatabase);
const remindersRepository = new RemindersRepository(notesDatabase);
const voiceAttachmentsRepository = new VoiceAttachmentsRepository(notesDatabase);

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
  const [linkLibrary, setLinkLibrary] = useState<NoteRecord[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
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

  const refreshLinkLibrary = useCallback(async () => {
    const [active, archived] = await Promise.all([
      repository.listActive(),
      repository.listArchived(),
    ]);
    setLinkLibrary([...active, ...archived]);
  }, [repository]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshLinkLibrary();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [note.id, note.updatedAt, refreshLinkLibrary]);

  const draftNote = useMemo<NoteRecord>(
    () => ({ ...note, title: draft.title, content: draft.content }),
    [draft.content, draft.title, note],
  );
  const effectiveLinkLibrary = useMemo(
    () => [draftNote, ...linkLibrary.filter((candidate) => candidate.id !== note.id)],
    [draftNote, linkLibrary, note.id],
  );
  const resolveEditorWikiLink = useCallback(
    (title: string) => resolveWikiLink(title, effectiveLinkLibrary),
    [effectiveLinkLibrary],
  );

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
      if (addOpen || moreOpen) {
        event.preventDefault();
        setAddOpen(false);
        setMoreOpen(false);
        return;
      }
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

  const openLinkedNote = async (noteId: string) => {
    const saved = await saveNow();
    if (!saved) return;
    await revisionsRepository.checkpoint(saved.id, 'close').catch(() => undefined);
    onClose();
    await requestLinkedNoteOpen(noteId);
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
    setMoreOpen(false);
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
          className="note-editor-dialog note-editor-dialog-simplified"
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
            resolveWikiLink={resolveEditorWikiLink}
            onWikiLinkOpen={(noteId) => void openLinkedNote(noteId)}
            onChange={setContent}
          />

          {attachmentsOpen ? (
            <div className="note-editor-secondary-panel">
              <AttachmentPanel
                noteId={note.id}
                repository={attachmentsRepository}
                refreshKey={attachmentRefreshKey}
                onChanged={onAttachmentsChanged}
              />
            </div>
          ) : null}

          {connectionsOpen ? (
            <div className="note-editor-secondary-panel">
              <ConnectionsPanel
                note={draftNote}
                library={effectiveLinkLibrary}
                repository={repository}
                beforeLinking={saveNow}
                onOpenNote={(noteId) => void openLinkedNote(noteId)}
                onSourceSaved={onSaved}
                onLibraryChanged={refreshLinkLibrary}
              />
            </div>
          ) : null}

          <div className="note-editor-footer note-editor-footer-simplified">
            <div className="note-editor-primary-actions">
              <div className="note-editor-menu-slot">
                <button
                  className="note-editor-secondary"
                  type="button"
                  aria-expanded={addOpen}
                  onClick={() => {
                    setMoreOpen(false);
                    setAddOpen((open) => !open);
                  }}
                >
                  <Plus aria-hidden="true" /> Add
                </button>
                {addOpen ? (
                  <div className="note-editor-tools-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddOpen(false);
                        setAttachmentsOpen(true);
                      }}
                    >
                      <Paperclip aria-hidden="true" /> Image / attachment
                    </button>
                    <DrawingAttachmentButton
                      noteId={note.id}
                      repository={attachmentsRepository}
                      className="note-editor-menu-control"
                      onChanged={(noteId) => {
                        setAddOpen(false);
                        setAttachmentsOpen(true);
                        onAttachmentsChanged(noteId);
                      }}
                    />
                    <VoiceAttachmentButton
                      noteId={note.id}
                      repository={voiceAttachmentsRepository}
                      className="note-editor-menu-control"
                      onChanged={(noteId) => {
                        setAddOpen(false);
                        setAttachmentsOpen(true);
                        onAttachmentsChanged(noteId);
                      }}
                    />
                    <OcrAttachmentControl
                      noteId={note.id}
                      repository={attachmentsRepository}
                      refreshKey={attachmentRefreshKey}
                      onAppend={(text) => {
                        setAddOpen(false);
                        setContent(appendOcrText(draft.content, text));
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <ReminderControl
                noteId={note.id}
                repository={remindersRepository}
                onChanged={() => undefined}
              />

              <button
                className="note-editor-secondary note-editor-attachments-toggle"
                type="button"
                aria-pressed={attachmentsOpen}
                onClick={() => setAttachmentsOpen((open) => !open)}
              >
                <Paperclip aria-hidden="true" /> Attachments
              </button>
            </div>

            <div className="note-editor-state" aria-live="polite">
              {status === 'saving' ? <span className="sr-only">Saving…</span> : null}
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
              <div className="note-editor-menu-slot">
                <button
                  className="note-editor-secondary"
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => {
                    setAddOpen(false);
                    setMoreOpen((open) => !open);
                  }}
                >
                  <MoreHorizontal aria-hidden="true" /> More
                </button>
                {moreOpen ? (
                  <div className="note-editor-more-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setConnectionsOpen((open) => !open);
                      }}
                    >
                      <Workflow aria-hidden="true" /> Connections
                    </button>
                    <button type="button" role="menuitem" onClick={() => void openHistory()}>
                      <History aria-hidden="true" /> History
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        void convert();
                      }}
                    >
                      <ListChecks aria-hidden="true" /> Convert to checklist
                    </button>
                  </div>
                ) : null}
              </div>
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
