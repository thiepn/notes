import { isPreviewableImageMimeType, isVoiceAudioMimeType, type AttachmentRecord } from '../../db';

export interface AttachmentSummary {
  count: number;
  totalBytes: number;
  imageCount: number;
  audioCount: number;
  fileCount: number;
}

const FRIENDLY_MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/gif': 'GIF image',
  'image/webp': 'WebP image',
  'image/avif': 'AVIF image',
  'audio/webm': 'WebM audio',
  'audio/ogg': 'Ogg audio',
  'audio/mp4': 'M4A audio',
  'audio/mpeg': 'MP3 audio',
  'audio/aac': 'AAC audio',
  'audio/wav': 'WAV audio',
  'audio/x-wav': 'WAV audio',
  'audio/x-m4a': 'M4A audio',
  'application/pdf': 'PDF document',
  'text/plain': 'Text document',
  'text/markdown': 'Markdown document',
  'application/json': 'JSON document',
  'text/csv': 'CSV document',
  'application/zip': 'ZIP archive',
  'application/x-zip-compressed': 'ZIP archive',
};

export function summarizeAttachments(attachments: AttachmentRecord[]): AttachmentSummary {
  let imageCount = 0;
  let audioCount = 0;
  let totalBytes = 0;

  for (const attachment of attachments) {
    totalBytes += attachment.size;
    if (isPreviewableImageMimeType(attachment.mimeType)) imageCount += 1;
    else if (isVoiceAudioMimeType(attachment.mimeType)) audioCount += 1;
  }

  return {
    count: attachments.length,
    totalBytes,
    imageCount,
    audioCount,
    fileCount: Math.max(0, attachments.length - imageCount - audioCount),
  };
}

export function formatAttachmentSummary(summary: AttachmentSummary): string {
  if (summary.count === 0) return 'No attachments';
  return `${summary.count} ${summary.count === 1 ? 'attachment' : 'attachments'} · ${formatAttachmentBytes(summary.totalBytes)}`;
}

export function formatAttachmentBreakdown(summary: AttachmentSummary): string | null {
  const parts: string[] = [];
  if (summary.imageCount > 0) {
    parts.push(`${summary.imageCount} ${summary.imageCount === 1 ? 'image' : 'images'}`);
  }
  if (summary.audioCount > 0) {
    parts.push(`${summary.audioCount} ${summary.audioCount === 1 ? 'recording' : 'recordings'}`);
  }
  if (summary.fileCount > 0) {
    parts.push(`${summary.fileCount} ${summary.fileCount === 1 ? 'file' : 'files'}`);
  }
  return parts.length > 1 ? parts.join(' · ') : null;
}

export function formatAttachmentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

export function attachmentTypeLabel(mimeType: string): string {
  const normalized = mimeType.trim().toLocaleLowerCase().split(';', 1)[0] ?? '';
  if (FRIENDLY_MIME_LABELS[normalized]) return FRIENDLY_MIME_LABELS[normalized];
  if (normalized.startsWith('image/')) return 'Image';
  if (normalized.startsWith('audio/')) return 'Audio';
  if (normalized.startsWith('video/')) return 'Video';
  if (normalized.startsWith('text/')) return 'Text document';
  if (normalized.startsWith('application/')) return 'Document';
  return mimeType.trim() || 'Attachment';
}

export function formatMediaDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatImageDimensions(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return `${Math.round(width)} × ${Math.round(height)}`;
}
