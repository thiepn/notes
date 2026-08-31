import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ImagePlus, ListChecks } from 'lucide-react';

import {
  NATIVE_IMAGE_ACCEPT,
  type AttachmentsRepository,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { AttachmentPanel } from './AttachmentPanel';
import { useTextNoteCapture } from './useTextNoteCapture';

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
  const [quickImageMessage, setQuickImageMessage] = useState<string | null>(null);
  const [quickImageError, setQuickImageError] = useState<string | null>(null);
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
    setQuickImageMessage(null);
    setQuickImageError(null);
    try {
      const note = await ensureNote();
      if (!note) throw new Error('The note could not be created for this image.');
      const result = await attachmentsRepository.addImages(note.id, files);
      markAttachmentsChanged(note.id);
      if (result.added > 0) {
        setQuickImageMessage(`${result.added} ${result.added === 1 ? 'image' : 'images'} added.`);
      } else if (result.skippedDuplicates > 0) {
        setQuickImageMessage('That image is already attached to this note.');
      }
    } catch (error) {
      setQuickImageError(toErrorMessage(error));
    }
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

  if (!expanded) {
    return (
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
    );
  }

  return (
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
      <textarea
        ref={bodyRef}
        className="note-composer-body"
        value={draft.content}
        aria-label="Note text"
        placeholder="Take a note…"
        rows={1}
        autoFocus
        onChange={(event) => setContent(event.target.value)}
      />

      <AttachmentPanel
        noteId={activeNoteId}
        repository={attachmentsRepository}
        ensureNoteId={ensureNoteId}
        refreshKey={attachmentRefreshKey}
        onChanged={markAttachmentsChanged}
      />

      <div className="note-composer-footer">
        <div className="note-composer-state" aria-live="polite">
          {status === 'saving' ? <span>Saving…</span> : null}
          {quickImageMessage ? <span>{quickImageMessage}</span> : null}
          {quickImageError ? (
            <span className="note-composer-error" role="alert">
              {quickImageError}
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
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The image could not be attached.';
}
