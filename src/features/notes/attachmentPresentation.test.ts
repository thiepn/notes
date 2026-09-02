import { describe, expect, it } from 'vitest';

import type { AttachmentRecord } from '../../db';
import {
  attachmentTypeLabel,
  formatAttachmentBreakdown,
  formatAttachmentBytes,
  formatAttachmentSummary,
  formatImageDimensions,
  formatMediaDuration,
  summarizeAttachments,
} from './attachmentPresentation';

function attachment(
  mimeType: string,
  size: number,
  name = 'file',
): AttachmentRecord {
  return {
    id: crypto.randomUUID(),
    noteId: 'note',
    name,
    mimeType,
    size,
    checksum: crypto.randomUUID().replaceAll('-', ''),
    data: new Blob(['x'], { type: mimeType }),
    createdAt: 1,
  };
}

describe('attachment presentation helpers', () => {
  it('summarizes mixed attachment collections without persisting derived metadata', () => {
    const summary = summarizeAttachments([
      attachment('image/png', 1024),
      attachment('audio/webm;codecs=opus', 2048),
      attachment('application/pdf', 4096),
    ]);
    expect(summary).toEqual({
      count: 3,
      totalBytes: 7168,
      imageCount: 1,
      audioCount: 1,
      fileCount: 1,
    });
    expect(formatAttachmentSummary(summary)).toBe('3 attachments · 7.00 KB');
    expect(formatAttachmentBreakdown(summary)).toBe('1 image · 1 recording · 1 file');
  });

  it('formats byte sizes consistently', () => {
    expect(formatAttachmentBytes(0)).toBe('0 B');
    expect(formatAttachmentBytes(999)).toBe('999 B');
    expect(formatAttachmentBytes(1024)).toBe('1.00 KB');
    expect(formatAttachmentBytes(12 * 1024)).toBe('12.0 KB');
    expect(formatAttachmentBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
  });

  it('uses friendly MIME labels with codec parameter normalization', () => {
    expect(attachmentTypeLabel('image/jpeg')).toBe('JPEG image');
    expect(attachmentTypeLabel('audio/webm;codecs=opus')).toBe('WebM audio');
    expect(attachmentTypeLabel('application/pdf')).toBe('PDF document');
    expect(attachmentTypeLabel('text/plain')).toBe('Text document');
    expect(attachmentTypeLabel('application/x-custom')).toBe('Document');
  });

  it('formats media durations and image dimensions', () => {
    expect(formatMediaDuration(8)).toBe('0:08');
    expect(formatMediaDuration(64)).toBe('1:04');
    expect(formatMediaDuration(3723)).toBe('1:02:03');
    expect(formatMediaDuration(Number.NaN)).toBeNull();
    expect(formatImageDimensions(1920, 1080)).toBe('1920 × 1080');
    expect(formatImageDimensions(0, 1080)).toBeNull();
  });
});
