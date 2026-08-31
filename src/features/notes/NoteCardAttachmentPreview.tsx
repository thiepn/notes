import { useEffect, useRef, useState } from 'react';
import { Image, Paperclip } from 'lucide-react';

import {
  AttachmentsRepository,
  isPreviewableImageMimeType,
  notesDatabase,
  type AttachmentRecord,
} from '../../db';

const attachmentRepository = new AttachmentsRepository(notesDatabase);

interface PreviewState {
  count: number;
  imageCount: number;
  firstImage: AttachmentRecord | null;
}

const EMPTY_PREVIEW: PreviewState = { count: 0, imageCount: 0, firstImage: null };

export function NoteCardAttachmentPreview({
  noteId,
  refreshKey = 0,
}: {
  noteId: string;
  refreshKey?: number;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = useBlobUrl(imageFailed ? null : preview.firstImage?.data ?? null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || shouldLoad) return;
    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '480px 0px' },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    setLoaded(false);
    setImageFailed(false);
    void attachmentRepository
      .list(noteId)
      .then((attachments) => {
        if (cancelled) return;
        const images = attachments.filter((attachment) =>
          isPreviewableImageMimeType(attachment.mimeType),
        );
        setPreview({
          count: attachments.length,
          imageCount: images.length,
          firstImage: images[0] ?? null,
        });
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(EMPTY_PREVIEW);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId, refreshKey, shouldLoad]);

  const hasImage = Boolean(imageUrl && preview.firstImage && !imageFailed);
  return (
    <span
      ref={rootRef}
      className="note-card-attachment-preview"
      data-loaded={loaded}
      data-has-attachment={preview.count > 0}
      data-has-image={hasImage}
      aria-hidden="true"
    >
      {hasImage ? (
        <span className="note-card-image-wrap">
          <img
            src={imageUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
          {preview.imageCount > 1 ? (
            <span className="note-card-image-count">
              <Image /> {preview.imageCount}
            </span>
          ) : null}
          {preview.count > preview.imageCount ? (
            <span className="note-card-file-count">
              <Paperclip /> {preview.count - preview.imageCount}
            </span>
          ) : null}
        </span>
      ) : preview.count > 0 ? (
        <span className="note-card-file-only">
          <Paperclip /> {preview.count} {preview.count === 1 ? 'attachment' : 'attachments'}
        </span>
      ) : null}
    </span>
  );
}

function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
