import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileImage,
  ImagePlus,
  Maximize2,
  Mic,
  Trash2,
  X,
} from 'lucide-react';

import { useDialogFocusTrap } from '../../components/ui/useDialogFocusTrap';

import {
  isPreviewableImageMimeType,
  isVoiceAudioMimeType,
  NATIVE_IMAGE_ACCEPT,
  type AttachmentRecord,
  type AttachmentsRepository,
} from '../../db';
import {
  attachmentTypeLabel,
  formatAttachmentBreakdown,
  formatAttachmentBytes,
  formatAttachmentSummary,
  formatImageDimensions,
  formatMediaDuration,
  summarizeAttachments,
} from './attachmentPresentation';

interface AttachmentPanelProps {
  noteId: string | null;
  repository: AttachmentsRepository;
  ensureNoteId?: (() => Promise<string | null>) | undefined;
  editable?: boolean;
  refreshKey?: number;
  onChanged?: ((noteId: string) => void) | undefined;
}

type AddSource = 'picker' | 'drop' | 'paste' | 'camera';
type AttachmentAction =
  | { kind: 'add'; source: AddSource }
  | { kind: 'remove'; attachmentId: string }
  | null;
type FeedbackFocus = 'status' | 'error' | null;

export function AttachmentPanel({
  noteId,
  repository,
  ensureNoteId,
  editable = true,
  refreshKey = 0,
  onChanged,
}: AttachmentPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const errorRef = useRef<HTMLSpanElement>(null);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [busyAction, setBusyAction] = useState<AttachmentAction>(null);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackFocus, setFeedbackFocus] = useState<FeedbackFocus>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const targetNoteId = noteId ?? createdNoteId;
  const busy = busyAction !== null;
  const loading = Boolean(targetNoteId && loadedNoteId !== targetNoteId);
  const mutationLocked = busy || loading || pendingRemoveId !== null;

  useEffect(() => {
    if (!targetNoteId) return;
    let cancelled = false;
    void repository
      .list(targetNoteId)
      .then((storedAttachments) => {
        if (cancelled) return;
        setAttachments(storedAttachments);
        setLoadedNoteId(targetNoteId);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage('Attachments could not be loaded.');
        setLoadedNoteId(targetNoteId);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, repository, targetNoteId]);

  useEffect(() => {
    if (busy || !feedbackFocus) return;
    const target = feedbackFocus === 'error' ? errorRef.current : statusRef.current;
    const frame = window.requestAnimationFrame(() => {
      target?.focus({ preventScroll: true });
      setFeedbackFocus((current) => (current === feedbackFocus ? null : current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, feedbackFocus]);

  const focusRemoveTrigger = useCallback((attachmentId: string) => {
    window.requestAnimationFrame(() => {
      const trigger = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-attachment-remove-id]') ?? [],
      ).find((button) => button.dataset.attachmentRemoveId === attachmentId);
      trigger?.focus({ preventScroll: true });
    });
  }, []);

  const cancelRemove = useCallback(
    (attachmentId: string) => {
      if (busy) return;
      setPendingRemoveId(null);
      focusRemoveTrigger(attachmentId);
    },
    [busy, focusRemoveTrigger],
  );

  useEffect(() => {
    if (!pendingRemoveId || busy) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelRemove(pendingRemoveId);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [busy, cancelRemove, pendingRemoveId]);

  const addFiles = useCallback(
    async (files: File[], source: AddSource = 'picker') => {
      if (!editable || files.length === 0 || busy || loading || pendingRemoveId) return;
      setBusyAction({ kind: 'add', source });
      setDragActive(false);
      setStatusMessage(null);
      setErrorMessage(null);
      setFeedbackFocus(null);
      try {
        const target = targetNoteId ?? (await ensureNoteId?.()) ?? null;
        if (!target) throw new Error('Save the note before adding an image.');
        if (!noteId) setCreatedNoteId(target);
        await assertStorageLooksSufficient(files);
        const result = await repository.addImages(target, files);
        setAttachments(result.attachments);
        setLoadedNoteId(target);
        setStatusMessage(formatAddResult(result.added, result.skippedDuplicates, source));
        onChanged?.(target);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setFeedbackFocus('error');
      } finally {
        setBusyAction(null);
      }
    },
    [
      busy,
      editable,
      ensureNoteId,
      loading,
      noteId,
      onChanged,
      pendingRemoveId,
      repository,
      targetNoteId,
    ],
  );

  useEffect(() => {
    if (!editable || mutationLocked) return;
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.toLocaleLowerCase().startsWith('image/'),
      );
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files, 'paste');
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addFiles, editable, mutationLocked]);

  const requestRemove = (attachmentId: string) => {
    if (!editable || busy || loading || pendingRemoveId) return;
    setStatusMessage(null);
    setErrorMessage(null);
    setFeedbackFocus(null);
    setPendingRemoveId(attachmentId);
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!editable || !targetNoteId || busy || loading || pendingRemoveId !== attachmentId) return;
    setBusyAction({ kind: 'remove', attachmentId });
    setStatusMessage(null);
    setErrorMessage(null);
    setFeedbackFocus(null);
    try {
      const remaining = await repository.remove(targetNoteId, attachmentId);
      setAttachments(remaining);
      setPendingRemoveId(null);
      if (lightboxId === attachmentId) setLightboxId(null);
      setStatusMessage('Attachment removed.');
      setFeedbackFocus('status');
      onChanged?.(targetNoteId);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setFeedbackFocus('error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!editable) return;
    event.preventDefault();
    setDragActive(false);
    if (mutationLocked) return;
    void addFiles(Array.from(event.dataTransfer.files), 'drop');
  };

  const closeLightbox = useCallback(() => {
    const returnToId = lightboxId;
    setLightboxId(null);
    if (!returnToId) return;
    window.requestAnimationFrame(() => {
      const trigger = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-attachment-open-id]') ?? [],
      ).find((button) => button.dataset.attachmentOpenId === returnToId);
      trigger?.focus({ preventScroll: true });
    });
  }, [lightboxId]);

  const previewImages = attachments.filter((attachment) =>
    isPreviewableImageMimeType(attachment.mimeType),
  );
  const audioAttachments = attachments.filter((attachment) =>
    isVoiceAudioMimeType(attachment.mimeType),
  );
  const otherAttachments = attachments.filter(
    (attachment) =>
      !isPreviewableImageMimeType(attachment.mimeType) &&
      !isVoiceAudioMimeType(attachment.mimeType),
  );
  const lightboxIndex = lightboxId
    ? previewImages.findIndex((attachment) => attachment.id === lightboxId)
    : -1;
  const summary = summarizeAttachments(attachments);
  const breakdown = formatAttachmentBreakdown(summary);

  return (
    <section
      ref={panelRef}
      className="attachment-panel"
      data-drag-active={dragActive}
      data-action={loading ? 'loading' : (busyAction?.kind ?? undefined)}
      aria-busy={busy || loading || undefined}
      aria-label="Attachments"
      onDragEnter={(event) => {
        if (!editable || mutationLocked || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!editable || mutationLocked || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={handleDrop}
    >
      <div className="attachment-panel-heading">
        <div>
          <strong>{loading || attachments.length > 0 ? 'Attachments' : 'Images'}</strong>
          {loading ? (
            <span>Loading saved media…</span>
          ) : attachments.length > 0 ? (
            <>
              <span>{formatAttachmentSummary(summary)}</span>
              {breakdown ? <small className="attachment-panel-breakdown">{breakdown}</small> : null}
            </>
          ) : (
            <span>JPEG, PNG, GIF, WebP, or AVIF</span>
          )}
        </div>
        {editable ? (
          <div className="attachment-source-actions">
            <input
              ref={inputRef}
              className="attachment-file-input"
              type="file"
              accept={NATIVE_IMAGE_ACCEPT}
              multiple
              aria-label="Choose images"
              disabled={mutationLocked}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void addFiles(files, 'picker');
              }}
            />
            <input
              ref={cameraInputRef}
              className="attachment-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Take photo"
              disabled={mutationLocked}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void addFiles(files, 'camera');
              }}
            />
            <button
              className="attachment-add-button attachment-camera-button"
              type="button"
              aria-label="Take a photo"
              disabled={mutationLocked}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera aria-hidden="true" />
              {busyAction?.kind === 'add' && busyAction.source === 'camera'
                ? 'Capturing…'
                : 'Camera'}
            </button>
            <button
              className="attachment-add-button"
              type="button"
              disabled={mutationLocked}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {busyAction?.kind === 'add' && busyAction.source !== 'camera'
                ? 'Adding…'
                : 'Add image'}
            </button>
          </div>
        ) : null}
      </div>

      {previewImages.length > 0 ? (
        <div className="attachment-image-grid" aria-label="Attached images">
          {previewImages.map((attachment) => {
            const blocked =
              busy ||
              loading ||
              (pendingRemoveId !== null && pendingRemoveId !== attachment.id);
            const removing =
              busyAction?.kind === 'remove' && busyAction.attachmentId === attachment.id;
            return (
              <AttachmentImageTile
                key={attachment.id}
                attachment={attachment}
                editable={editable}
                pendingRemove={pendingRemoveId === attachment.id}
                blocked={blocked}
                removing={removing}
                onOpen={() => setLightboxId(attachment.id)}
                onRequestRemove={() => requestRemove(attachment.id)}
                onCancelRemove={() => cancelRemove(attachment.id)}
                onConfirmRemove={() => void removeAttachment(attachment.id)}
              />
            );
          })}
        </div>
      ) : null}

      {audioAttachments.length > 0 ? (
        <div className="attachment-audio-list" aria-label="Voice recordings">
          {audioAttachments.map((attachment) => {
            const blocked =
              busy ||
              loading ||
              (pendingRemoveId !== null && pendingRemoveId !== attachment.id);
            const removing =
              busyAction?.kind === 'remove' && busyAction.attachmentId === attachment.id;
            return (
              <AttachmentAudioRow
                key={attachment.id}
                attachment={attachment}
                editable={editable}
                pendingRemove={pendingRemoveId === attachment.id}
                blocked={blocked}
                removing={removing}
                onRequestRemove={() => requestRemove(attachment.id)}
                onCancelRemove={() => cancelRemove(attachment.id)}
                onConfirmRemove={() => void removeAttachment(attachment.id)}
              />
            );
          })}
        </div>
      ) : null}

      {otherAttachments.length > 0 ? (
        <div className="attachment-file-list" aria-label="Other attachments">
          {otherAttachments.map((attachment) => {
            const blocked =
              busy ||
              loading ||
              (pendingRemoveId !== null && pendingRemoveId !== attachment.id);
            const removing =
              busyAction?.kind === 'remove' && busyAction.attachmentId === attachment.id;
            return (
              <AttachmentFileRow
                key={attachment.id}
                attachment={attachment}
                editable={editable}
                pendingRemove={pendingRemoveId === attachment.id}
                blocked={blocked}
                removing={removing}
                onRequestRemove={() => requestRemove(attachment.id)}
                onCancelRemove={() => cancelRemove(attachment.id)}
                onConfirmRemove={() => void removeAttachment(attachment.id)}
              />
            );
          })}
        </div>
      ) : null}

      {editable && !loading && attachments.length === 0 ? (
        <button
          className="attachment-empty-dropzone"
          type="button"
          disabled={mutationLocked}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" />
          <span>
            <strong>Add an image</strong>
            <small>or drag/paste images here</small>
          </span>
        </button>
      ) : null}

      {dragActive ? <div className="attachment-drop-overlay">Drop images to attach</div> : null}

      <div className="attachment-panel-state" aria-live="polite">
        {statusMessage ? (
          <span ref={statusRef} role="status" tabIndex={-1}>
            {statusMessage}
          </span>
        ) : null}
        {errorMessage ? (
          <span ref={errorRef} className="attachment-panel-error" role="alert" tabIndex={-1}>
            {errorMessage}
          </span>
        ) : null}
      </div>

      {lightboxIndex >= 0 ? (
        <AttachmentLightbox
          attachments={previewImages}
          index={lightboxIndex}
          onIndexChange={(index) => setLightboxId(previewImages[index]?.id ?? null)}
          onClose={closeLightbox}
        />
      ) : null}
    </section>
  );
}

function AttachmentImageTile({
  attachment,
  editable,
  pendingRemove,
  blocked,
  removing,
  onOpen,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  blocked: boolean;
  removing: boolean;
  onOpen(): void;
  onRequestRemove(): void;
  onCancelRemove(): void;
  onConfirmRemove(): void;
}) {
  const url = useBlobUrl(attachment.data);
  const label = attachment.name ?? 'Attached image';
  return (
    <div className="attachment-image-tile">
      <button
        className="attachment-image-open"
        type="button"
        data-attachment-open-id={attachment.id}
        aria-label={`Open image: ${label}`}
        onClick={onOpen}
      >
        {url ? <img src={url} alt={label} loading="lazy" /> : null}
        <span className="attachment-image-open-icon" aria-hidden="true">
          <Maximize2 />
        </span>
      </button>
      <div className="attachment-image-meta">
        <span>
          <strong title={label}>{label}</strong>
          <small>
            {attachmentTypeLabel(attachment.mimeType)} · {formatAttachmentBytes(attachment.size)}
          </small>
        </span>
        <button
          type="button"
          aria-label={`Download image: ${label}`}
          onClick={() => downloadAttachment(attachment)}
        >
          <Download aria-hidden="true" />
        </button>
      </div>
      {editable ? (
        pendingRemove ? (
          <div className="attachment-remove-confirm" role="group" aria-label={`Remove ${label}?`}>
            <span>Remove?</span>
            <button type="button" autoFocus disabled={blocked} onClick={onConfirmRemove}>
              {removing ? 'Removing…' : 'Yes'}
            </button>
            <button type="button" disabled={blocked} onClick={onCancelRemove}>
              No
            </button>
          </div>
        ) : (
          <button
            className="attachment-remove-button"
            type="button"
            data-attachment-remove-id={attachment.id}
            aria-label={`Remove image: ${label}`}
            disabled={blocked}
            onClick={onRequestRemove}
          >
            <Trash2 aria-hidden="true" />
          </button>
        )
      ) : null}
    </div>
  );
}

function AttachmentAudioRow({
  attachment,
  editable,
  pendingRemove,
  blocked,
  removing,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  blocked: boolean;
  removing: boolean;
  onRequestRemove(): void;
  onCancelRemove(): void;
  onConfirmRemove(): void;
}) {
  const url = useBlobUrl(attachment.data);
  const name = attachment.name ?? 'Voice recording';
  const [duration, setDuration] = useState<number | null>(null);
  const durationLabel = formatMediaDuration(duration);
  return (
    <div className="attachment-audio-row">
      <span className="attachment-audio-icon" aria-hidden="true">
        <Mic />
      </span>
      <span className="attachment-audio-main">
        <span className="attachment-audio-copy">
          <strong title={name}>{name}</strong>
          <small>
            {[
              durationLabel,
              attachmentTypeLabel(attachment.mimeType),
              formatAttachmentBytes(attachment.size),
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </span>
        {url ? (
          <audio
            controls
            preload="metadata"
            src={url}
            aria-label={`Play voice recording: ${name}`}
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              setDuration(Number.isFinite(nextDuration) ? nextDuration : null);
            }}
            onDurationChange={(event) => {
              const nextDuration = event.currentTarget.duration;
              setDuration(Number.isFinite(nextDuration) ? nextDuration : null);
            }}
          />
        ) : null}
      </span>
      <span className="attachment-audio-actions">
        <button
          type="button"
          aria-label={`Download voice recording: ${name}`}
          onClick={() => downloadAttachment(attachment)}
        >
          <Download aria-hidden="true" />
        </button>
        {editable ? (
          pendingRemove ? (
            <>
              <button
                type="button"
                autoFocus
                aria-label={`Confirm remove voice recording: ${name}`}
                disabled={blocked}
                onClick={onConfirmRemove}
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
              <button
                type="button"
                aria-label={`Cancel remove voice recording: ${name}`}
                disabled={blocked}
                onClick={onCancelRemove}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              data-attachment-remove-id={attachment.id}
              aria-label={`Remove voice recording: ${name}`}
              disabled={blocked}
              onClick={onRequestRemove}
            >
              <Trash2 aria-hidden="true" />
            </button>
          )
        ) : null}
      </span>
    </div>
  );
}

function AttachmentFileRow({
  attachment,
  editable,
  pendingRemove,
  blocked,
  removing,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  blocked: boolean;
  removing: boolean;
  onRequestRemove(): void;
  onCancelRemove(): void;
  onConfirmRemove(): void;
}) {
  const name = attachment.name ?? 'Attachment';
  const imageLike = attachment.mimeType.startsWith('image/');
  return (
    <div className="attachment-file-row">
      <span className="attachment-file-icon" aria-hidden="true">
        {imageLike ? <FileImage /> : <File />}
      </span>
      <span className="attachment-file-copy">
        <strong title={name}>{name}</strong>
        <small>
          {attachmentTypeLabel(attachment.mimeType)} · {formatAttachmentBytes(attachment.size)}
        </small>
      </span>
      <button
        className="attachment-file-action"
        type="button"
        aria-label={`Download attachment: ${name}`}
        onClick={() => downloadAttachment(attachment)}
      >
        <Download aria-hidden="true" />
      </button>
      {editable ? (
        pendingRemove ? (
          <div
            className="attachment-file-remove-confirm"
            role="group"
            aria-label={`Remove ${name}?`}
          >
            <button type="button" autoFocus disabled={blocked} onClick={onConfirmRemove}>
              {removing ? 'Removing…' : 'Remove'}
            </button>
            <button type="button" disabled={blocked} onClick={onCancelRemove}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="attachment-file-action attachment-file-remove"
            type="button"
            data-attachment-remove-id={attachment.id}
            aria-label={`Remove attachment: ${name}`}
            disabled={blocked}
            onClick={onRequestRemove}
          >
            <Trash2 aria-hidden="true" />
          </button>
        )
      ) : null}
    </div>
  );
}

function AttachmentLightbox({
  attachments,
  index,
  onIndexChange,
  onClose,
}: {
  attachments: AttachmentRecord[];
  index: number;
  onIndexChange(index: number): void;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap(dialogRef, { onEscape: onClose, initialFocusRef: closeRef });
  const attachment = attachments[index];
  const url = useBlobUrl(attachment?.data ?? null);
  const [dimensions, setDimensions] = useState<{
    attachmentId: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!attachment) return null;
  const name = attachment.name ?? 'Attached image';
  const dimensionLabel =
    dimensions?.attachmentId === attachment.id
      ? formatImageDimensions(dimensions.width, dimensions.height)
      : null;
  const meta = [
    dimensionLabel,
    attachmentTypeLabel(attachment.mimeType),
    formatAttachmentBytes(attachment.size),
  ]
    .filter(Boolean)
    .join(' · ');
  const move = (direction: 1 | -1) =>
    onIndexChange((index + direction + attachments.length) % attachments.length);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'ArrowLeft' && attachments.length > 1) {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'ArrowRight' && attachments.length > 1) {
      event.preventDefault();
      move(1);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="attachment-lightbox-layer"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${name}`}
      onKeyDown={handleKeyDown}
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="attachment-lightbox-toolbar">
        <span className="attachment-lightbox-position" aria-live="polite">
          {index + 1} / {attachments.length}
        </span>
        <button
          type="button"
          aria-label={`Download image: ${name}`}
          onClick={() => downloadAttachment(attachment)}
        >
          <Download aria-hidden="true" />
        </button>
        <button ref={closeRef} type="button" aria-label="Close image viewer" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>

      {attachments.length > 1 ? (
        <button
          className="attachment-lightbox-nav attachment-lightbox-prev"
          type="button"
          aria-label="Previous image"
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      ) : null}

      <div className="attachment-lightbox-image-wrap">
        {url ? (
          <img
            src={url}
            alt={name}
            onLoad={(event) =>
              setDimensions({
                attachmentId: attachment.id,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        ) : null}
        <div className="attachment-lightbox-meta">
          <strong title={name}>{name}</strong>
          <span>{meta}</span>
        </div>
      </div>

      {attachments.length > 1 ? (
        <button
          className="attachment-lightbox-nav attachment-lightbox-next"
          type="button"
          aria-label="Next image"
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

interface BlobUrlState {
  blob: Blob | null;
  url: string | null;
}

function useBlobUrl(blob: Blob | null): string | null {
  const [state, setState] = useState<BlobUrlState>({ blob: null, url: null });

  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    const frame = window.requestAnimationFrame(() => setState({ blob, url: next }));
    return () => {
      window.cancelAnimationFrame(frame);
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  return blob !== null && state.blob === blob ? state.url : null;
}

function downloadAttachment(attachment: AttachmentRecord): void {
  const url = URL.createObjectURL(attachment.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.name?.trim() || 'attachment';
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function assertStorageLooksSufficient(files: File[]): Promise<void> {
  if (!navigator.storage?.estimate) return;
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota === undefined) return;
    const available = Math.max(0, estimate.quota - (estimate.usage ?? 0));
    const required = files.reduce((total, file) => total + file.size, 0);
    if (required > available) {
      throw new Error(
        `These images need about ${formatAttachmentBytes(required)}, but the browser reports only ${formatAttachmentBytes(available)} available.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('browser reports only')) throw error;
  }
}

function formatAddResult(added: number, skippedDuplicates: number, source: AddSource): string {
  if (added === 0 && skippedDuplicates > 0) {
    return `${skippedDuplicates} duplicate ${skippedDuplicates === 1 ? 'image was' : 'images were'} skipped.`;
  }
  const verb = source === 'paste' ? 'pasted' : source === 'camera' ? 'captured' : 'added';
  const addedText = `${added} ${added === 1 ? 'image' : 'images'} ${verb}.`;
  return skippedDuplicates > 0
    ? `${addedText} ${skippedDuplicates} duplicate ${skippedDuplicates === 1 ? 'was' : 'images were'} skipped.`
    : addedText;
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attachment operation could not be completed.';
}
