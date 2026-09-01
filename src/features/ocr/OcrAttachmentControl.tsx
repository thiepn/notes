import { useEffect, useState } from 'react';
import { ScanText } from 'lucide-react';

import {
  isPreviewableImageMimeType,
  type AttachmentRecord,
  type AttachmentsRepository,
} from '../../db';
import { OcrDialog } from './OcrDialog';

interface OcrAttachmentControlProps {
  noteId: string | null;
  repository: AttachmentsRepository;
  refreshKey?: number;
  onAppend?: ((text: string) => Promise<void> | void) | undefined;
}

export function OcrAttachmentControl({
  noteId,
  repository,
  refreshKey = 0,
  onAppend,
}: OcrAttachmentControlProps) {
  const [images, setImages] = useState<AttachmentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [openAttachment, setOpenAttachment] = useState<AttachmentRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    void repository
      .list(noteId)
      .then((attachments) => {
        if (cancelled) return;
        const nextImages = attachments.filter((attachment) =>
          isPreviewableImageMimeType(attachment.mimeType),
        );
        setImages(nextImages);
        setSelectedId((current) =>
          nextImages.some((image) => image.id === current) ? current : (nextImages[0]?.id ?? ''),
        );
        setErrorMessage(null);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Images could not be loaded for OCR.');
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, refreshKey, repository]);

  if (!noteId || images.length === 0) return null;
  const selected = images.find((image) => image.id === selectedId) ?? images[0] ?? null;

  return (
    <>
      <section className="ocr-attachment-control" aria-label="Image text recognition">
        <div>
          <span className="ocr-attachment-control-icon" aria-hidden="true">
            <ScanText />
          </span>
          <span>
            <strong>OCR</strong>
            <small>Extract text locally from an attached image</small>
          </span>
        </div>
        <div>
          {images.length > 1 ? (
            <select
              value={selected?.id ?? ''}
              aria-label="Image for OCR"
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {images.map((image, index) => (
                <option key={image.id} value={image.id}>
                  {image.name?.trim() || `Image ${index + 1}`}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) setOpenAttachment(selected);
            }}
          >
            <ScanText aria-hidden="true" /> Extract text
          </button>
        </div>
        {errorMessage ? (
          <span className="ocr-error" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </section>

      {openAttachment ? (
        <OcrDialog
          attachment={openAttachment}
          onAppend={onAppend}
          onClose={() => setOpenAttachment(null)}
        />
      ) : null}
    </>
  );
}
