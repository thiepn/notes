import {
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  type NotesDatabase,
} from '../../db';
import { parseWikiLinks } from '../links/linkIntelligence';
import { richTextToPlainText } from '../richText/richText';
import {
  extractIndexedOcrText,
  normalizeSearchText,
  tokenizeNormalizedSearchText,
  type SearchDocument,
} from './searchEngine';

const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;

export class SearchRepository {
  constructor(private readonly database: NotesDatabase) {}

  async loadIndex(): Promise<SearchDocument[]> {
    const [
      rawNotes,
      rawItems,
      rawLabels,
      rawLinks,
      attachmentNameKeys,
      attachmentMimeKeys,
      rawReminders,
    ] = await Promise.all([
      this.database.notes.toArray(),
      this.database.checklistItems.toArray(),
      this.database.labels.toArray(),
      this.database.noteLabels.toArray(),
      this.database.attachments.orderBy('[noteId+name]').keys(),
      this.database.attachments.orderBy('[noteId+mimeType]').keys(),
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
    const attachmentNamesByNote = new Map<string, string[]>();
    for (const rawKey of attachmentNameKeys) {
      const key = compoundStringKey(rawKey);
      if (!key) continue;
      const [noteId, rawName] = key;
      if (!noteIds.has(noteId)) continue;
      const name = rawName.trim();
      if (!name) continue;
      const names = attachmentNamesByNote.get(noteId) ?? [];
      names.push(name);
      attachmentNamesByNote.set(noteId, names);
    }
    for (const rawKey of attachmentMimeKeys) {
      const key = compoundStringKey(rawKey);
      if (!key) continue;
      const [noteId, mimeType] = key;
      if (noteIds.has(noteId) && mimeType.startsWith('image/')) imageNoteIds.add(noteId);
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
      const attachmentNames = attachmentNamesByNote.get(note.id) ?? [];
      const checklistText = checklistItems.map((item) => item.text).join('\n');
      const plainBody = note.type === 'text' ? richTextToPlainText(note.content) : note.content;
      const ocrText = note.type === 'text' ? extractIndexedOcrText(note.content) : '';
      const combinedLinkText = [note.title, plainBody, checklistText].join('\n');
      const normalizedTitle = normalizeSearchText(note.title);
      const normalizedBody = normalizeSearchText(plainBody);
      const normalizedChecklist = normalizeSearchText(checklistText);
      const normalizedLabels = normalizeSearchText(labelNames.join(' '));
      const normalizedAttachments = normalizeSearchText(attachmentNames.join(' '));
      const normalizedOcr = normalizeSearchText(ocrText);
      const hasInternalLink = note.type === 'text' && parseWikiLinks(note.content).length > 0;
      const titleTokens = tokenizeNormalizedSearchText(normalizedTitle);
      const bodyTokens = tokenizeNormalizedSearchText(normalizedBody);
      const checklistTokens = tokenizeNormalizedSearchText(normalizedChecklist);
      const labelTokens = tokenizeNormalizedSearchText(normalizedLabels);
      const attachmentTokens = tokenizeNormalizedSearchText(normalizedAttachments);
      const ocrTokens = tokenizeNormalizedSearchText(normalizedOcr);
      const normalizedAll = [
        normalizedTitle,
        normalizedBody,
        normalizedChecklist,
        normalizedLabels,
        normalizedAttachments,
      ]
        .filter(Boolean)
        .join(' ');

      return {
        note,
        checklistItems,
        labelIds,
        labelNames,
        attachmentNames,
        ocrText,
        hasImage: imageNoteIds.has(note.id),
        hasLink: hasInternalLink || LINK_PATTERN.test(combinedLinkText),
        hasReminder: reminderNoteIds.has(note.id),
        normalizedTitle,
        normalizedBody,
        normalizedChecklist,
        normalizedLabels,
        normalizedAttachments,
        normalizedOcr,
        normalizedAll,
        titleTokens,
        bodyTokens,
        checklistTokens,
        labelTokens,
        attachmentTokens,
        ocrTokens,
        allTokens: [
          ...new Set([
            ...titleTokens,
            ...bodyTokens,
            ...checklistTokens,
            ...labelTokens,
            ...attachmentTokens,
          ]),
        ],
      };
    });
  }
}

function compoundStringKey(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second] = value;
  return typeof first === 'string' && typeof second === 'string' ? [first, second] : null;
}
