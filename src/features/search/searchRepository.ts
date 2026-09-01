import {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  type NotesDatabase,
} from '../../db';
import { parseWikiLinks } from '../links/linkIntelligence';
import { richTextToPlainText } from '../richText/richText';
import { normalizeSearchText, type SearchDocument } from './searchEngine';

const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;

export class SearchRepository {
  constructor(private readonly database: NotesDatabase) {}

  async loadIndex(): Promise<SearchDocument[]> {
    const [rawNotes, rawItems, rawLabels, rawLinks, rawAttachments, rawReminders] =
      await Promise.all([
        this.database.notes.toArray(),
        this.database.checklistItems.toArray(),
        this.database.labels.toArray(),
        this.database.noteLabels.toArray(),
        this.database.attachments.toArray(),
        this.database.reminders.toArray(),
      ]);

    const notes = rawNotes
      .map((note) => noteRecordSchema.parse(note))
      .filter((note) => note.trashedAt === null);
    const noteIds = new Set(notes.map((note) => note.id));
    const itemsByNote = new Map<string, ReturnType<typeof checklistItemRecordSchema.parse>[]>();
    for (const rawItem of rawItems) {
      const item = checklistItemRecordSchema.parse(rawItem);
      if (!noteIds.has(item.noteId)) continue;
      const items = itemsByNote.get(item.noteId) ?? [];
      items.push(item);
      itemsByNote.set(item.noteId, items);
    }
    for (const items of itemsByNote.values()) {
      items.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    }

    const labelsById = new Map(
      rawLabels.map((rawLabel) => {
        const label = labelRecordSchema.parse(rawLabel);
        return [label.id, label] as const;
      }),
    );
    const labelIdsByNote = new Map<string, string[]>();
    for (const rawLink of rawLinks) {
      const link = noteLabelRecordSchema.parse(rawLink);
      if (!noteIds.has(link.noteId)) continue;
      const labelIds = labelIdsByNote.get(link.noteId) ?? [];
      labelIds.push(link.labelId);
      labelIdsByNote.set(link.noteId, labelIds);
    }

    const imageNoteIds = new Set<string>();
    for (const rawAttachment of rawAttachments) {
      const attachment = attachmentRecordSchema.parse(rawAttachment);
      if (noteIds.has(attachment.noteId) && attachment.mimeType.startsWith('image/')) {
        imageNoteIds.add(attachment.noteId);
      }
    }

    const reminderNoteIds = new Set<string>();
    for (const rawReminder of rawReminders) {
      const reminder = reminderRecordSchema.parse(rawReminder);
      if (noteIds.has(reminder.noteId) && reminder.status === 'active') {
        reminderNoteIds.add(reminder.noteId);
      }
    }

    return notes.map((note) => {
      const checklistItems = itemsByNote.get(note.id) ?? [];
      const labelIds = labelIdsByNote.get(note.id) ?? [];
      const labelNames = labelIds
        .map((labelId) => labelsById.get(labelId)?.name)
        .filter((name): name is string => Boolean(name));
      const checklistText = checklistItems.map((item) => item.text).join('\n');
      const plainBody = note.type === 'text' ? richTextToPlainText(note.content) : note.content;
      const combinedLinkText = [note.title, plainBody, checklistText].join('\n');
      const normalizedTitle = normalizeSearchText(note.title);
      const normalizedBody = normalizeSearchText(plainBody);
      const normalizedChecklist = normalizeSearchText(checklistText);
      const normalizedLabels = normalizeSearchText(labelNames.join(' '));
      const hasInternalLink = note.type === 'text' && parseWikiLinks(note.content).length > 0;

      return {
        note,
        checklistItems,
        labelIds,
        labelNames,
        hasImage: imageNoteIds.has(note.id),
        hasLink: hasInternalLink || LINK_PATTERN.test(combinedLinkText),
        hasReminder: reminderNoteIds.has(note.id),
        normalizedTitle,
        normalizedBody,
        normalizedChecklist,
        normalizedLabels,
        normalizedAll: [normalizedTitle, normalizedBody, normalizedChecklist, normalizedLabels]
          .filter(Boolean)
          .join(' '),
      };
    });
  }
}
