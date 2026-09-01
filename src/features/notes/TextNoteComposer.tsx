import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ImagePlus, ListChecks, Mic, PencilLine } from 'lucide-react';

import {
  NATIVE_IMAGE_ACCEPT,
  VoiceAttachmentsRepository,
  notesDatabase,
  type AttachmentsRepository,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { DrawingAttachmentButton } from '../drawing/DrawingAttachmentButton';
import { DrawingDialog } from '../drawing/DrawingDialog';
import { appendOcrText } from '../ocr/ocr';
import { OcrAttachmentControl } from '../ocr/OcrAttachmentControl';
import { RichTextEditor } from '../richText/RichTextEditor';
import { VoiceAttachmentButton } from '../voice/VoiceAttachmentButton';
import { VoiceRecorderDialog } from '../voice/VoiceRecorderDialog';
import { AttachmentPanel } from './AttachmentPanel';
import { useTextNoteCapture } from './useTextNoteCapture';

const voiceAttachmentsRepository = new VoiceAttachmentsRepository(notesDatabase);

interface TextNoteComposerProps {
  repository: NotesRepository;
  attachmentsRepository: AttachmentsRepository;
  beforeSaved?: ((note: NoteRecord) => Promise<void>) | undefined;
  onSaved(note: NoteRecord): void;
  onRemoved(noteId: string): void;
  onActiveNoteChange(noteId: string | null): void;
  onAttachmentsChanged(noteId: string): void;
  onChecklistRequested(): void;
}

export function TextNoteComposer({
  repository,
  attachmentsRepository,
  beforeSaved,
  onSaved,
  onRemoved,
  onActiveNoteChange,
  onAttachmentsChanged,
  onChecklistRequested,
}: TextNoteComposerProps) {
  const composerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const quickImageInputRef = useRef<HTMLInputElement>(null);
  const [attachmentRefreshKey, setAttachmentRefreshKey] = useState(0);
  const [quickAttachmentMessage, setQuickAttachmentMessage] = useState<string | null>(null);
  const [quickAttachmentError, setQuickAttachmentError] = useState<string | null>(null);
  const [quickDrawingOpen, setQuickDrawingOpen] = useState(false);
  const [quickVoiceOpen, setQuickVoiceOpen] = useState(false);
  const {
    activeNoteId,
    draft,
    errorMessage,
    expanded,
    status,
    openCapture,
    ensureNote,
    setTitle,
    setContent,
    finishCapture,
    retrySave,
  } = useTextNoteCapture({
    repository,
    beforeSaved,
    shouldPreserveEmptyNote: (noteId) => attachmentsRepository.hasAny(noteId),
    onSaved,
    onRemoved,
  });

  useEffect(() => {
    onActiveNoteChange(activeNoteId);
  }, [activeNoteId, onActiveNoteChange]);

  useEffect(() => {
    if (!expanded) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (composerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest('.drawing-dialog-layer') ||
          target.closest('.voice-dialog-layer') ||
          target.closest('.ocr-dialog-layer'))
      ) {
        return;
      }
      void finishCapture();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [expanded, finishCapture]);

  useLayoutEffect(() => {
    const textarea = bodyRef.current;
    if (!textarea || !expanded) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft.content, expanded]);

  const ensureNoteId = useCallback(async () => (await ensureNote())?.id ?? null, [ensureNote]);

  const markAttachmentsChanged = useCallback(
    (noteId: string) => {
      setAttachmentRefreshKey((current) => current + 1);
      onAttachmentsChanged(noteId);
    },
    [onAttachmentsChanged],
  );

  const handleQuickImages = async (files: File[]) => {
    if (files.length === 0) return;
    openCapture();
    setQuickAttachmentMessage(null);
    setQuickAttachmentError(null);
    try {
      const note = await ensureNote();
      if (!note) throw new Error('The note could not be created for this image.');
      const result = await attachmentsRepository.addImages(note.id, files);
      markAttachmentsChanged(note.id);
      if (result.added > 0) {
        setQuickAttachmentMessage(
          `${result.added} ${result.added === 1 ? 'image' : 'images'} added.`,
        );
      } else if (result.skippedDuplicates > 0) {
        setQuickAttachmentMessage('That image is already attached to this note.');
      }
    } catch (error) {
      setQuickAttachmentError(toErrorMessage(error));
    }
  };

  const handleQuickDrawing = async (file: File) => {
    setQuickAttachmentMessage(null);
    setQuickAttachmentError(null);
    const note = await ensureNote();
    if (!note) throw new Error('The note could not be created for this drawing.');
    const result = await attachmentsRepository.addImages(note.id, [file]);
    markAttachmentsChanged(note.id);
    if (result.added > 0) setQuickAttachmentMessage('Drawing added.');
    else if (result.skippedDuplicates > 0)
      setQuickAttachmentMessage('That drawing is already attached.');
  };

  const handleQuickVoice = async (file: File) => {
    setQuickAttachmentMessage(null);
    setQuickAttachmentError(null);
    const note = await ensureNote();
    if (!note) throw new Error('The note could not be created for this voice recording.');
    const result = await voiceAttachmentsRepository.addRecording(note.id, file);
    markAttachmentsChanged(note.id);
    setQuickAttachmentMessage(
      result.skippedDuplicate
        ? 'That voice recording is already attached.'
        : 'Voice recording added.',
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void finishCapture();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void finishCapture();
    }
  };

  const composer = !expanded ? (
    <div className="note-composer-collapsed" aria-label="Create a note">
      <button
        className="note-composer-main-action"
        type="button"
        aria-label="Create a text note"
        aria-expanded="false"
        onClick={openCapture}
      >
        Take a note…
      </button>
      <div className="note-composer-hints">
        <button
          className="note-composer-quick-action"
          type="button"
          aria-label="Create a checklist"
          title="New checklist"
          onClick={onChecklistRequested}
        >
          <ListChecks aria-hidden="true" />
        </button>
        <button
          className="note-composer-quick-action"
          type="button"
          aria-label="Add drawing"
          title="New drawing note"
          onClick={() => {
            openCapture();
            setQuickDrawingOpen(true);
          }}
        >
          <PencilLine aria-hidden="true" />
        </button>
        <button
          className="note-composer-quick-action"
          type="button"
          aria-label="Record voice note"
          title="New voice note"
          onClick={() => {
            openCapture();
            setQuickVoiceOpen(true);
          }}
        >
          <Mic aria-hidden="true" />
        </button>
        <input
          ref={quickImageInputRef}
          className="attachment-file-input"
          type="file"
          accept={NATIVE_IMAGE_ACCEPT}
          multiple
          aria-label="Choose images for new note"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void handleQuickImages(files);
          }}
        />
        <button
          className="note-composer-quick-action"
          type="button"
          aria-label="Add image to new note"
          title="New image note"
          onClick={() => quickImageInputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
        </button>
      </div>
    </div>
  ) : (
    <div
      ref={composerRef}
      className="note-composer"
      role="form"
      aria-label="New note"
      onKeyDown={handleKeyDown}
    >
      <input
        className="note-composer-title"
        type="text"
        value={draft.title}
        aria-label="Title"
        placeholder="Title"
        autoComplete="off"
        onChange={(event) => setTitle(event.target.value)}
      />
      <RichTextEditor
        textareaRef={bodyRef}
        className="note-composer-body"
        value={draft.content}
        ariaLabel="Note text"
        placeholder="Take a note…"
        rows={1}
        autoFocus={!quickDrawingOpen && !quickVoiceOpen}
        onChange={setContent}
      />

      <div className="drawing-inline-action">
        <DrawingAttachmentButton
          noteId={activeNoteId}
          repository={attachmentsRepository}
          ensureNoteId={ensureNoteId}
          className="note-editor-secondary"
          onChanged={markAttachmentsChanged}
        />
        <VoiceAttachmentButton
          noteId={activeNoteId}
          repository={voiceAttachmentsRepository}
          ensureNoteId={ensureNoteId}
          className="note-editor-secondary"
          onChanged={markAttachmentsChanged}
        />
      </div>

      <AttachmentPanel
        noteId={activeNoteId}
        repository={attachmentsRepository}
        ensureNoteId={ensureNoteId}
        refreshKey={attachmentRefreshKey}
        onChanged={markAttachmentsChanged}
      />

      <OcrAttachmentControl
        noteId={activeNoteId}
        repository={attachmentsRepository}
        refreshKey={attachmentRefreshKey}
        onAppend={(text) => setContent(appendOcrText(draft.content, text))}
      />

      <div className="note-composer-footer">
        <div className="note-composer-state" aria-live="polite">
          {status === 'saving' ? <span>Saving…</span> : null}
          {quickAttachmentMessage ? <span>{quickAttachmentMessage}</span> : null}
          {quickAttachmentError ? (
            <span className="note-composer-error" role="alert">
              {quickAttachmentError}
            </span>
          ) : null}
          {errorMessage ? (
            <span className="note-composer-error" role="alert">
              {errorMessage}
              <button type="button" onClick={retrySave}>
                Retry
              </button>
            </span>
          ) : null}
        </div>
        <button className="note-composer-close" type="button" onClick={() => void finishCapture()}>
          Close
        </button>
      </div>
    </div>
  );

  return (
    <>
      {composer}
      {quickDrawingOpen ? (
        <DrawingDialog onSave={handleQuickDrawing} onClose={() => setQuickDrawingOpen(false)} />
      ) : null}
      {quickVoiceOpen ? (
        <VoiceRecorderDialog onSave={handleQuickVoice} onClose={() => setQuickVoiceOpen(false)} />
      ) : null}
    </>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attachment could not be added.';
}
