import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { ImagePlus, ListChecks, Mic, Paperclip, PencilLine, Plus } from 'lucide-react';

import {
  NATIVE_IMAGE_ACCEPT,
  VoiceAttachmentsRepository,
  notesDatabase,
  type AttachmentsRepository,
  type NoteRecord,
  type NotesRepository,
} from '../../db';
import { appendOcrText } from '../ocr/ocr';
import { RichTextEditor } from '../richText/RichTextEditor';
import type { CaptureRequest } from './captureTypes';
import { useTextNoteCapture } from './useTextNoteCapture';

const DrawingAttachmentButton = lazy(() =>
  import('../drawing/DrawingAttachmentButton').then((module) => ({
    default: module.DrawingAttachmentButton,
  })),
);
const DrawingDialog = lazy(() =>
  import('../drawing/DrawingDialog').then((module) => ({ default: module.DrawingDialog })),
);
const OcrAttachmentControl = lazy(() =>
  import('../ocr/OcrAttachmentControl').then((module) => ({
    default: module.OcrAttachmentControl,
  })),
);
const VoiceAttachmentButton = lazy(() =>
  import('../voice/VoiceAttachmentButton').then((module) => ({
    default: module.VoiceAttachmentButton,
  })),
);
const VoiceRecorderDialog = lazy(() =>
  import('../voice/VoiceRecorderDialog').then((module) => ({
    default: module.VoiceRecorderDialog,
  })),
);
const AttachmentPanel = lazy(() =>
  import('./AttachmentPanel').then((module) => ({ default: module.AttachmentPanel })),
);

const voiceAttachmentsRepository = new VoiceAttachmentsRepository(notesDatabase);

interface TextNoteComposerProps {
  captureRequest?: CaptureRequest | null;
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
  captureRequest,
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
  const lastCaptureRequestIdRef = useRef<number | undefined>(undefined);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const captureTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreCaptureFocusRef = useRef(false);
  const quickImageInputRef = useRef<HTMLInputElement>(null);
  const expandedImageInputRef = useRef<HTMLInputElement>(null);
  const quickToolsTriggerRef = useRef<HTMLButtonElement>(null);
  const quickToolsMenuRef = useRef<HTMLDivElement>(null);
  const expandedToolsTriggerRef = useRef<HTMLButtonElement>(null);
  const expandedToolsMenuRef = useRef<HTMLDivElement>(null);
  const initialToolsFocusRef = useRef<'first' | 'last'>('first');
  const [attachmentRefreshKey, setAttachmentRefreshKey] = useState(0);
  const [quickAttachmentMessage, setQuickAttachmentMessage] = useState<string | null>(null);
  const [quickAttachmentError, setQuickAttachmentError] = useState<string | null>(null);
  const [quickDrawingOpen, setQuickDrawingOpen] = useState(false);
  const [quickVoiceOpen, setQuickVoiceOpen] = useState(false);
  const [quickToolsOpen, setQuickToolsOpen] = useState(false);
  const [expandedToolsOpen, setExpandedToolsOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
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

  useEffect(() => {
    const kind = quickToolsOpen ? 'quick' : expandedToolsOpen ? 'expanded' : null;
    if (!kind) return;

    const surfaceRef = kind === 'quick' ? quickToolsMenuRef : expandedToolsMenuRef;
    const triggerRef = kind === 'quick' ? quickToolsTriggerRef : expandedToolsTriggerRef;
    const closeSurface = (restoreFocus = false) => {
      if (kind === 'quick') setQuickToolsOpen(false);
      else setExpandedToolsOpen(false);
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
      }
    };

    const focusFrame = window.requestAnimationFrame(() => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const items = kind === 'quick' ? toolMenuItems(surface) : popoverControls(surface);
      const target =
        kind === 'quick' && initialToolsFocusRef.current === 'last' ? items.at(-1) : items[0];
      target?.focus({ preventScroll: true });
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (surfaceRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeSurface();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (surfaceRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeSurface();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSurface(true);
        return;
      }

      if (kind !== 'quick' || !surface.contains(document.activeElement)) return;
      const items = toolMenuItems(surface);
      if (items.length === 0) return;
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      let nextIndex: number | null = null;

      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      items[nextIndex]?.focus({ preventScroll: true });
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [expandedToolsOpen, quickToolsOpen]);

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
      setAttachmentsOpen(true);
      onAttachmentsChanged(noteId);
    },
    [onAttachmentsChanged],
  );

  const handleQuickImages = useCallback(
    async (files: File[], source: 'picker' | 'paste' = 'picker') => {
      if (files.length === 0) return;
      openCapture();
      setQuickToolsOpen(false);
      setQuickAttachmentMessage(null);
      setQuickAttachmentError(null);
      try {
        const note = await ensureNote();
        if (!note) throw new Error('The note could not be created for this image.');
        const result = await attachmentsRepository.addImages(note.id, files);
        markAttachmentsChanged(note.id);
        if (result.added > 0) {
          setQuickAttachmentMessage(
            source === 'paste'
              ? `${result.added} ${result.added === 1 ? 'image' : 'images'} pasted.`
              : `${result.added} ${result.added === 1 ? 'image' : 'images'} added.`,
          );
        } else if (result.skippedDuplicates > 0) {
          setQuickAttachmentMessage('That image is already attached to this note.');
        }
      } catch (error) {
        setQuickAttachmentError(toErrorMessage(error));
      }
    },
    [attachmentsRepository, ensureNote, markAttachmentsChanged, openCapture],
  );

  useEffect(() => {
    if (!expanded || attachmentsOpen) return;
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.toLocaleLowerCase().startsWith('image/'),
      );
      if (files.length === 0) return;
      event.preventDefault();
      void handleQuickImages(files, 'paste');
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [attachmentsOpen, expanded, handleQuickImages]);

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

  useEffect(() => {
    const request = captureRequest;
    if (!request || lastCaptureRequestIdRef.current === request.id) return;
    lastCaptureRequestIdRef.current = request.id;
    const frame = window.requestAnimationFrame(() => {
      openCapture();
      if (request.kind === 'drawing') {
        setQuickDrawingOpen(true);
        return;
      }
      if (request.kind === 'voice') {
        setQuickVoiceOpen(true);
        return;
      }
      if (request.kind === 'image' || request.kind === 'scan') {
        const files = request.files ?? [];
        if (request.kind === 'scan') setExpandedToolsOpen(true);
        if (files.length > 0) void handleQuickImages(files);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [captureRequest, handleQuickImages, openCapture]);

  const finishAndRestoreFocus = useCallback(async () => {
    restoreCaptureFocusRef.current = true;
    const finished = await finishCapture();
    if (!finished) restoreCaptureFocusRef.current = false;
  }, [finishCapture]);

  useLayoutEffect(() => {
    if (expanded || !restoreCaptureFocusRef.current) return;
    restoreCaptureFocusRef.current = false;
    captureTriggerRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void finishAndRestoreFocus();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void finishAndRestoreFocus();
    }
  };

  const composer = !expanded ? (
    <div className="note-composer-collapsed" aria-label="Create a note">
      <button
        ref={captureTriggerRef}
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
        <div className="note-composer-menu-slot">
          <button
            ref={quickToolsTriggerRef}
            className="note-composer-quick-action"
            type="button"
            aria-label="More capture options"
            title="More capture options"
            aria-expanded={quickToolsOpen}
            aria-haspopup="menu"
            aria-controls="note-composer-quick-tools"
            onClick={() => {
              initialToolsFocusRef.current = 'first';
              setQuickToolsOpen((open) => !open);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                initialToolsFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
                setQuickToolsOpen(true);
              }
            }}
          >
            <Plus aria-hidden="true" />
          </button>
          {quickToolsOpen ? (
            <div
              ref={quickToolsMenuRef}
              className="note-composer-tools-menu"
              id="note-composer-quick-tools"
              role="menu"
              aria-label="More capture options"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setQuickToolsOpen(false);
                  quickImageInputRef.current?.click();
                }}
              >
                <ImagePlus aria-hidden="true" /> Image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setQuickToolsOpen(false);
                  openCapture();
                  setQuickDrawingOpen(true);
                }}
              >
                <PencilLine aria-hidden="true" /> Drawing
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setQuickToolsOpen(false);
                  openCapture();
                  setQuickVoiceOpen(true);
                }}
              >
                <Mic aria-hidden="true" /> Voice recording
              </button>
            </div>
          ) : null}
        </div>
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
      </div>
    </div>
  ) : (
    <div
      ref={composerRef}
      data-editing-note={activeNoteId ?? undefined}
      className="note-composer note-composer-simplified"
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
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="next"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          bodyRef.current?.focus();
        }}
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

      {attachmentsOpen ? (
        <div className="note-composer-secondary-panel">
          <Suspense fallback={<DeferredComposerTool label="Loading attachments…" />}>
            <AttachmentPanel
              noteId={activeNoteId}
              repository={attachmentsRepository}
              ensureNoteId={ensureNoteId}
              refreshKey={attachmentRefreshKey}
              onChanged={markAttachmentsChanged}
            />
          </Suspense>
        </div>
      ) : null}

      <input
        ref={expandedImageInputRef}
        className="attachment-file-input"
        type="file"
        accept={NATIVE_IMAGE_ACCEPT}
        multiple
        aria-label="Choose images for note"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void handleQuickImages(files);
        }}
      />

      <div className="note-composer-footer note-composer-footer-simplified">
        <div className="note-composer-primary-actions">
          <div className="note-composer-menu-slot">
            <button
              ref={expandedToolsTriggerRef}
              className="note-editor-secondary note-composer-add-button"
              type="button"
              aria-expanded={expandedToolsOpen}
              aria-haspopup="dialog"
              aria-controls="note-composer-expanded-tools"
              onClick={() => setExpandedToolsOpen((open) => !open)}
            >
              <Plus aria-hidden="true" /> Add
            </button>
            {expandedToolsOpen ? (
              <div
                ref={expandedToolsMenuRef}
                className="note-composer-tools-menu note-composer-tools-menu-expanded"
                id="note-composer-expanded-tools"
                role="dialog"
                aria-label="Add to note"
              >
                <button
                  type="button"
                  onClick={() => {
                    setExpandedToolsOpen(false);
                    expandedImageInputRef.current?.click();
                  }}
                >
                  <ImagePlus aria-hidden="true" /> Image
                </button>
                <Suspense fallback={<DeferredComposerTool label="Loading tools…" />}>
                  <DrawingAttachmentButton
                    noteId={activeNoteId}
                    repository={attachmentsRepository}
                    ensureNoteId={ensureNoteId}
                    className="note-composer-menu-control"
                    onDialogClose={() => setExpandedToolsOpen(false)}
                    onChanged={(noteId) => {
                      setExpandedToolsOpen(false);
                      markAttachmentsChanged(noteId);
                    }}
                  />
                  <VoiceAttachmentButton
                    noteId={activeNoteId}
                    repository={voiceAttachmentsRepository}
                    ensureNoteId={ensureNoteId}
                    className="note-composer-menu-control"
                    onDialogClose={() => setExpandedToolsOpen(false)}
                    onChanged={(noteId) => {
                      setExpandedToolsOpen(false);
                      markAttachmentsChanged(noteId);
                    }}
                  />
                  <OcrAttachmentControl
                    noteId={activeNoteId}
                    repository={attachmentsRepository}
                    refreshKey={attachmentRefreshKey}
                    onAppend={(text) => {
                      setExpandedToolsOpen(false);
                      setContent(appendOcrText(draft.content, text));
                    }}
                  />
                </Suspense>
              </div>
            ) : null}
          </div>

          <button
            className="note-editor-secondary note-composer-attachments-button"
            type="button"
            aria-pressed={attachmentsOpen}
            onClick={() => setAttachmentsOpen((open) => !open)}
          >
            <Paperclip aria-hidden="true" /> Attachments
          </button>
        </div>

        <div className="note-composer-state" aria-live="polite">
          {status === 'saving' ? <span className="sr-only">Saving…</span> : null}
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
        <button
          className="note-composer-close"
          type="button"
          onClick={() => void finishAndRestoreFocus()}
        >
          Close
        </button>
      </div>
    </div>
  );

  return (
    <>
      {composer}
      {quickDrawingOpen ? (
        <Suspense fallback={null}>
          <DrawingDialog onSave={handleQuickDrawing} onClose={() => setQuickDrawingOpen(false)} />
        </Suspense>
      ) : null}
      {quickVoiceOpen ? (
        <Suspense fallback={null}>
          <VoiceRecorderDialog onSave={handleQuickVoice} onClose={() => setQuickVoiceOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}

function DeferredComposerTool({ label }: { label: string }) {
  return (
    <span className="deferred-composer-tool" role="status">
      {label}
    </span>
  );
}

function toolMenuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
    (item) => !item.disabled && item.getClientRects().length > 0,
  );
}

function popoverControls(popover: HTMLElement | null): HTMLElement[] {
  if (!popover) return [];
  return Array.from(
    popover.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((item) => item.getClientRects().length > 0);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attachment could not be added.';
}
