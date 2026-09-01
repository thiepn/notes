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

import {
  isPreviewableImageMimeType,
  isVoiceAudioMimeType,
  NATIVE_IMAGE_ACCEPT,
  type AttachmentRecord,
  type AttachmentsRepository,
} from '../../db';

interface AttachmentPanelProps {
  noteId: string | null;
  repository: AttachmentsRepository;
  ensureNoteId?: (() => Promise<string | null>) | undefined;
  editable?: boolean;
  refreshKey?: number;
  onChanged?: ((noteId: string) => void) | undefined;
}

type AddSource = 'picker' | 'drop' | 'paste' | 'camera';

export function AttachmentPanel({
  noteId,
  repository,
  ensureNoteId,
  editable = true,
  refreshKey = 0,
  onChanged,
}: AttachmentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const targetNoteId = noteId ?? createdNoteId;

  useEffect(() => {
    if (!targetNoteId) return;
    let cancelled = false;
    void repository
      .list(targetNoteId)
      .then((storedAttachments) => {
        if (cancelled) return;
        setAttachments(storedAttachments);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Attachments could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, repository, targetNoteId]);

  const addFiles = useCallback(
    async (files: File[], source: AddSource = 'picker') => {
      if (!editable || files.length === 0 || busy) return;
      setBusy(true);
      setStatusMessage(null);
      setErrorMessage(null);
      try {
        const target = targetNoteId ?? (await ensureNoteId?.()) ?? null;
        if (!target) throw new Error('Save the note before adding an image.');
        if (!noteId) setCreatedNoteId(target);
        await assertStorageLooksSufficient(files);
        const result = await repository.addImages(target, files);
        setAttachments(result.attachments);
        setStatusMessage(formatAddResult(result.added, result.skippedDuplicates, source));
        onChanged?.(target);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      } finally {
        setBusy(false);
      }
    },
    [busy, editable, ensureNoteId, noteId, onChanged, repository, targetNoteId],
  );

  useEffect(() => {
    if (!editable) return;
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
  }, [addFiles, editable]);

  const removeAttachment = async (attachmentId: string) => {
    if (!editable || !targetNoteId || busy) return;
    setBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const remaining = await repository.remove(targetNoteId, attachmentId);
      setAttachments(remaining);
      setPendingRemoveId(null);
      if (lightboxId === attachmentId) setLightboxId(null);
      setStatusMessage('Attachment removed.');
      onChanged?.(targetNoteId);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!editable) return;
    event.preventDefault();
    setDragActive(false);
    void addFiles(Array.from(event.dataTransfer.files), 'drop');
  };

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

  return (
    <section
      className="attachment-panel"
      data-drag-active={dragActive}
      aria-label="Attachments"
      onDragEnter={(event) => {
        if (!editable || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!editable || !hasFiles(event.dataTransfer)) return;
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
          <strong>{attachments.length > 0 ? 'Attachments' : 'Images'}</strong>
          {attachments.length > 0 ? (
            <span>
              {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
            </span>
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
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera aria-hidden="true" />
              Camera
            </button>
            <button
              className="attachment-add-button"
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {busy ? 'Working…' : 'Add image'}
            </button>
          </div>
        ) : null}
      </div>

      {previewImages.length > 0 ? (
        <div className="attachment-image-grid" aria-label="Attached images">
          {previewImages.map((attachment) => (
            <AttachmentImageTile
              key={attachment.id}
              attachment={attachment}
              editable={editable}
              pendingRemove={pendingRemoveId === attachment.id}
              busy={busy}
              onOpen={() => setLightboxId(attachment.id)}
              onRequestRemove={() => setPendingRemoveId(attachment.id)}
              onCancelRemove={() => setPendingRemoveId(null)}
              onConfirmRemove={() => void removeAttachment(attachment.id)}
            />
          ))}
        </div>
      ) : null}

      {audioAttachments.length > 0 ? (
        <div className="attachment-audio-list" aria-label="Voice recordings">
          {audioAttachments.map((attachment) => (
            <AttachmentAudioRow
              key={attachment.id}
              attachment={attachment}
              editable={editable}
              pendingRemove={pendingRemoveId === attachment.id}
              busy={busy}
              onRequestRemove={() => setPendingRemoveId(attachment.id)}
              onCancelRemove={() => setPendingRemoveId(null)}
              onConfirmRemove={() => void removeAttachment(attachment.id)}
            />
          ))}
        </div>
      ) : null}

      {otherAttachments.length > 0 ? (
        <div className="attachment-file-list" aria-label="Other attachments">
          {otherAttachments.map((attachment) => (
            <AttachmentFileRow
              key={attachment.id}
              attachment={attachment}
              editable={editable}
              pendingRemove={pendingRemoveId === attachment.id}
              busy={busy}
              onRequestRemove={() => setPendingRemoveId(attachment.id)}
              onCancelRemove={() => setPendingRemoveId(null)}
              onConfirmRemove={() => void removeAttachment(attachment.id)}
            />
          ))}
        </div>
      ) : null}

      {editable && attachments.length === 0 ? (
        <button
          className="attachment-empty-dropzone"
          type="button"
          disabled={busy}
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
        {statusMessage ? <span>{statusMessage}</span> : null}
        {errorMessage ? (
          <span className="attachment-panel-error" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </div>

      {lightboxIndex >= 0 ? (
        <AttachmentLightbox
          attachments={previewImages}
          index={lightboxIndex}
          onIndexChange={(index) => setLightboxId(previewImages[index]?.id ?? null)}
          onClose={() => setLightboxId(null)}
        />
      ) : null}
    </section>
  );
}

function AttachmentImageTile({
  attachment,
  editable,
  pendingRemove,
  busy,
  onOpen,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  busy: boolean;
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
        aria-label={`Open image: ${label}`}
        onClick={onOpen}
      >
        {url ? <img src={url} alt={label} loading="lazy" /> : null}
        <span className="attachment-image-open-icon" aria-hidden="true">
          <Maximize2 />
        </span>
      </button>
      {editable ? (
        pendingRemove ? (
          <div className="attachment-remove-confirm" role="group" aria-label={`Remove ${label}?`}>
            <span>Remove?</span>
            <button type="button" disabled={busy} onClick={onConfirmRemove}>
              Yes
            </button>
            <button type="button" disabled={busy} onClick={onCancelRemove}>
              No
            </button>
          </div>
        ) : (
          <button
            className="attachment-remove-button"
            type="button"
            aria-label={`Remove image: ${label}`}
            disabled={busy}
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
  busy,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  busy: boolean;
  onRequestRemove(): void;
  onCancelRemove(): void;
  onConfirmRemove(): void;
}) {
  const url = useBlobUrl(attachment.data);
  const name = attachment.name ?? 'Voice recording';
  return (
    <div className="attachment-audio-row">
      <span className="attachment-audio-icon" aria-hidden="true">
        <Mic />
      </span>
      <span className="attachment-audio-main">
        <span className="attachment-audio-copy">
          <strong title={name}>{name}</strong>
          <small>{formatBytes(attachment.size)}</small>
        </span>
        {url ? (
          <audio
            controls
            preload="metadata"
            src={url}
            aria-label={`Play voice recording: ${name}`}
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
                aria-label={`Confirm remove voice recording: ${name}`}
                disabled={busy}
                onClick={onConfirmRemove}
              >
                Remove
              </button>
              <button
                type="button"
                aria-label={`Cancel remove voice recording: ${name}`}
                disabled={busy}
                onClick={onCancelRemove}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label={`Remove voice recording: ${name}`}
              disabled={busy}
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
  busy,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  pendingRemove: boolean;
  busy: boolean;
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
          {attachment.mimeType} · {formatBytes(attachment.size)}
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
            <button type="button" disabled={busy} onClick={onConfirmRemove}>
              Remove
            </button>
            <button type="button" disabled={busy} onClick={onCancelRemove}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="attachment-file-action attachment-file-remove"
            type="button"
            aria-label={`Remove attachment: ${name}`}
            disabled={busy}
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
  const attachment = attachments[index];
  const url = useBlobUrl(attachment?.data ?? null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!attachment) return null;
  const name = attachment.name ?? 'Attached image';
  const move = (direction: 1 | -1) =>
    onIndexChange((index + direction + attachments.length) % attachments.length);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
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
        <span>
          {index + 1} / {attachments.length}
        </span>
        <button
          type="button"
          aria-label={`Download image: ${name}`}
          onClick={() => downloadAttachment(attachment)}
        >
          <Download aria-hidden="true" />
        </button>
        <button type="button" aria-label="Close image viewer" autoFocus onClick={onClose}>
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
        {url ? <img src={url} alt={name} /> : null}
        <span>{name}</span>
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
        `These images need about ${formatBytes(required)}, but the browser reports only ${formatBytes(available)} available.`,
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The attachment operation could not be completed.';
}
