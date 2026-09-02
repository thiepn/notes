from pathlib import Path
import re

path = Path('src/features/notes/AttachmentPanel.tsx')
text = path.read_text()

import_marker = "} from '../../db';\n"
import_addition = """} from '../../db';
import {
  attachmentTypeLabel,
  formatAttachmentBreakdown,
  formatAttachmentBytes,
  formatAttachmentSummary,
  formatImageDimensions,
  formatMediaDuration,
  summarizeAttachments,
} from './attachmentPresentation';
"""
if import_addition not in text:
    if import_marker not in text:
        raise SystemExit('AttachmentPanel db import marker changed.')
    text = text.replace(import_marker, import_addition, 1)

category_marker = """  const lightboxIndex = lightboxId
    ? previewImages.findIndex((attachment) => attachment.id === lightboxId)
    : -1;
"""
category_replacement = category_marker + """  const summary = summarizeAttachments(attachments);
  const breakdown = formatAttachmentBreakdown(summary);
"""
if 'const summary = summarizeAttachments(attachments);' not in text:
    if category_marker not in text:
        raise SystemExit('Attachment category marker changed.')
    text = text.replace(category_marker, category_replacement, 1)

heading_old = """          {attachments.length > 0 ? (
            <span>
              {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
            </span>
          ) : (
            <span>JPEG, PNG, GIF, WebP, or AVIF</span>
          )}
"""
heading_new = """          {attachments.length > 0 ? (
            <>
              <span>{formatAttachmentSummary(summary)}</span>
              {breakdown ? <small className=\"attachment-panel-breakdown\">{breakdown}</small> : null}
            </>
          ) : (
            <span>JPEG, PNG, GIF, WebP, or AVIF</span>
          )}
"""
if heading_old in text:
    text = text.replace(heading_old, heading_new, 1)
elif 'formatAttachmentSummary(summary)' not in text:
    raise SystemExit('Attachment heading marker changed.')

image_block = r"function AttachmentImageTile\(\{.*?\n\}\n\nfunction AttachmentAudioRow"
image_replacement = r'''function AttachmentImageTile({
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

function AttachmentAudioRow'''
text, count = re.subn(image_block, image_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit('AttachmentImageTile block changed.')

audio_block = r"function AttachmentAudioRow\(\{.*?\n\}\n\nfunction AttachmentFileRow"
audio_replacement = r'''function AttachmentAudioRow({
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
            {[durationLabel, attachmentTypeLabel(attachment.mimeType), formatAttachmentBytes(attachment.size)]
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

function AttachmentFileRow'''
text, count = re.subn(audio_block, audio_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit('AttachmentAudioRow block changed.')

text = text.replace(
    "{attachment.mimeType} · {formatBytes(attachment.size)}",
    "{attachmentTypeLabel(attachment.mimeType)} · {formatAttachmentBytes(attachment.size)}",
    1,
)

lightbox_block = r"function AttachmentLightbox\(\{.*?\n\}\n\ninterface BlobUrlState"
lightbox_replacement = r'''function AttachmentLightbox({
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
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setDimensions(null);
  }, [attachment?.id]);

  if (!attachment) return null;
  const name = attachment.name ?? 'Attached image';
  const dimensionLabel = dimensions
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
        <span className="attachment-lightbox-position">
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
        {url ? (
          <img
            src={url}
            alt={name}
            onLoad={(event) =>
              setDimensions({
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

interface BlobUrlState'''
text, count = re.subn(lightbox_block, lightbox_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit('AttachmentLightbox block changed.')

text = text.replace('formatBytes(required)', 'formatAttachmentBytes(required)')
text = text.replace('formatBytes(available)', 'formatAttachmentBytes(available)')
text = re.sub(r"\nfunction formatBytes\(bytes: number\): string \{.*?\n\}\n\nfunction hasFiles", "\nfunction hasFiles", text, count=1, flags=re.S)

path.write_text(text)
