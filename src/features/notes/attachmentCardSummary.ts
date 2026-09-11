import {
  attachmentRecordSchema,
  isPreviewableImageMimeType,
  isVoiceAudioMimeType,
  notesDatabase,
  type AttachmentRecord,
} from '../../db';

export interface AttachmentCardSummary {
  count: number;
  imageCount: number;
  audioCount: number;
  firstImage: AttachmentRecord | null;
}

export const EMPTY_ATTACHMENT_CARD_SUMMARY: AttachmentCardSummary = {
  count: 0,
  imageCount: 0,
  audioCount: 0,
  firstImage: null,
};

export async function loadAttachmentCardSummary(noteId: string): Promise<AttachmentCardSummary> {
  const collection = () =>
    notesDatabase.attachments
      .where('[noteId+mimeType]')
      .between([noteId, ''], [noteId, '\uffff'], true, true);
  const [compoundKeys, primaryKeys] = await Promise.all([
    collection().keys(),
    collection().primaryKeys(),
  ]);

  let imageCount = 0;
  let audioCount = 0;
  let firstImageId: string | null = null;

  for (let index = 0; index < compoundKeys.length; index += 1) {
    const key = compoundKeys[index];
    const mimeType = Array.isArray(key) && typeof key[1] === 'string' ? key[1] : '';
    if (isPreviewableImageMimeType(mimeType)) {
      imageCount += 1;
      const primaryKey = primaryKeys[index];
      if (firstImageId === null && typeof primaryKey === 'string') firstImageId = primaryKey;
    }
    if (isVoiceAudioMimeType(mimeType)) audioCount += 1;
  }

  const firstImageRaw = firstImageId
    ? await notesDatabase.attachments.get(firstImageId)
    : undefined;
  return {
    count: compoundKeys.length,
    imageCount,
    audioCount,
    firstImage: firstImageRaw ? attachmentRecordSchema.parse(firstImageRaw) : null,
  };
}
