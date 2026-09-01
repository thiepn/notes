import type { NotesDatabase } from '../../db/database';
import {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  normalizeLabelName,
  noteLabelRecordSchema,
  noteRecordSchema,
  reminderRecordSchema,
  revisionRecordSchema,
  serializeRevisionSnapshot,
  settingRecordSchema,
  type AttachmentRecord,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteLabelRecord,
  type NoteRecord,
  type ReminderRecord,
  type RevisionRecord,
  type SettingRecord,
} from '../../db';
import {
  KEEP_IMPORT_LEDGER_PREFIX,
  prepareGoogleKeepImport,
  type KeepImportProgress,
  type PreparedKeepImport,
  type PreparedKeepNote,
} from './googleKeepImport';
import {
  augmentGoogleKeepReminders,
  type PreparedKeepImportWithReminders,
  type PreparedKeepNoteWithReminder,
} from './googleKeepReminderImport';

export interface GoogleKeepImportSelection {
  active: boolean;
  archived: boolean;
  trashed: boolean;
  attachments: boolean;
}

export const DEFAULT_GOOGLE_KEEP_IMPORT_SELECTION: GoogleKeepImportSelection = {
  active: true,
  archived: true,
  trashed: true,
  attachments: true,
};

export interface GoogleKeepCommitProgress {
  completed: number;
  total: number;
  message: string;
}

export interface GoogleKeepImportResult {
  importedNotes: number;
  importedNoteIds: string[];
  skippedAlreadyImported: number;
  skippedBySelection: number;
  createdLabels: number;
  importedAttachments: number;
  importedReminders: number;
}

interface GoogleKeepImportRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class GoogleKeepImportRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: GoogleKeepImportRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async inspect(
    files: File[],
    onProgress?: (progress: KeepImportProgress) => void,
  ): Promise<PreparedKeepImportWithReminders> {
    const existingSourceKeys = await this.importedSourceKeys();
    const prepared = await prepareGoogleKeepImport(files, existingSourceKeys, onProgress);
    return augmentGoogleKeepReminders(files, prepared);
  }

  async importPrepared(
    prepared: PreparedKeepImport,
    selection: GoogleKeepImportSelection = DEFAULT_GOOGLE_KEEP_IMPORT_SELECTION,
    onProgress?: (progress: GoogleKeepCommitProgress) => void,
  ): Promise<GoogleKeepImportResult> {
    const reminderPrepared = prepared as PreparedKeepImportWithReminders;
    const selectedNotes = reminderPrepared.notes.filter((note) =>
      shouldImportNote(note, selection),
    );
    const skippedBySelection = reminderPrepared.notes.length - selectedNotes.length;

    return this.database.transaction(
      'rw',
      [
        this.database.notes,
        this.database.checklistItems,
        this.database.labels,
        this.database.noteLabels,
        this.database.attachments,
        this.database.reminders,
        this.database.revisions,
        this.database.settings,
      ],
      async () => {
        const importedSourceKeys = await this.importedSourceKeys();
        const notesToImport = selectedNotes.filter(
          (note) => !noteSourceIdentities(note).some((key) => importedSourceKeys.has(key)),
        );
        const skippedAlreadyImported = selectedNotes.length - notesToImport.length;
        if (notesToImport.length === 0) {
          return {
            importedNotes: 0,
            importedNoteIds: [],
            skippedAlreadyImported,
            skippedBySelection,
            createdLabels: 0,
            importedAttachments: 0,
            importedReminders: 0,
          };
        }

        const importTimestamp = this.readClock();
        const existingLabels = (await this.database.labels.toArray()).map((label) =>
          labelRecordSchema.parse(label),
        );
        const existingNotes = (await this.database.notes.toArray()).map((note) =>
          noteRecordSchema.parse(note),
        );
        const nextPosition =
          existingNotes.reduce((highest, note) => Math.max(highest, note.position), -1) + 1;
        const labelByNormalized = new Map(
          existingLabels.map((label) => [label.nameNormalized, label]),
        );
        const newLabels: LabelRecord[] = [];
        const notes: NoteRecord[] = [];
        const checklistItems: ChecklistItemRecord[] = [];
        const noteLabels: NoteLabelRecord[] = [];
        const attachments: AttachmentRecord[] = [];
        const reminders: ReminderRecord[] = [];
        const revisions: RevisionRecord[] = [];
        const settings: SettingRecord[] = [];

        for (const [position, sourceNote] of notesToImport.entries()) {
          const built = this.buildImportedNote(
            sourceNote,
            nextPosition + position,
            importTimestamp,
            selection.attachments,
          );
          notes.push(built.note);
          checklistItems.push(...built.items);
          attachments.push(...built.attachments);
          if (built.reminder) reminders.push(built.reminder);
          revisions.push(built.revision);

          for (const labelName of sourceNote.labels) {
            const normalized = normalizeLabelName(labelName);
            let label = labelByNormalized.get(normalized);
            if (!label) {
              label = labelRecordSchema.parse({
                id: this.idFactory(),
                name: labelName,
                nameNormalized: normalized,
                createdAt: importTimestamp,
                updatedAt: importTimestamp,
              });
              labelByNormalized.set(normalized, label);
              newLabels.push(label);
            }
            noteLabels.push(
              noteLabelRecordSchema.parse({
                noteId: built.note.id,
                labelId: label.id,
                assignedAt: importTimestamp,
              }),
            );
          }

          settings.push(
            settingRecordSchema.parse({
              key: ledgerKey(sourceNote.sourceKey),
              value: JSON.stringify({
                noteId: built.note.id,
                sourcePath: sourceNote.sourcePath,
                sourceUpdatedAt: sourceNote.updatedAt,
                importedAt: importTimestamp,
              }),
              updatedAt: importTimestamp,
            }),
          );
          onProgress?.({
            completed: position + 1,
            total: notesToImport.length,
            message: `Preparing notes… ${position + 1} / ${notesToImport.length}`,
          });
        }

        if (newLabels.length > 0) await this.database.labels.bulkAdd(newLabels);
        await this.database.notes.bulkAdd(notes);
        if (checklistItems.length > 0) await this.database.checklistItems.bulkAdd(checklistItems);
        if (noteLabels.length > 0) await this.database.noteLabels.bulkAdd(noteLabels);
        if (attachments.length > 0) await this.database.attachments.bulkAdd(attachments);
        if (reminders.length > 0) await this.database.reminders.bulkAdd(reminders);
        if (revisions.length > 0) await this.database.revisions.bulkAdd(revisions);
        await this.database.settings.bulkPut(settings);

        onProgress?.({
          completed: notes.length,
          total: notes.length,
          message: `Imported ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}.`,
        });
        return {
          importedNotes: notes.length,
          importedNoteIds: notes.map((note) => note.id),
          skippedAlreadyImported,
          skippedBySelection,
          createdLabels: newLabels.length,
          importedAttachments: attachments.length,
          importedReminders: reminders.length,
        };
      },
    );
  }

  private buildImportedNote(
    source: PreparedKeepNoteWithReminder,
    position: number,
    importedAt: number,
    includeAttachments: boolean,
  ) {
    const noteId = this.idFactory();
    const lifecycle = importedLifecycle(source);
    const note = noteRecordSchema.parse({
      id: noteId,
      type: source.type,
      title: source.title,
      content: source.type === 'text' ? source.content : '',
      color: source.color,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      pinnedAt: lifecycle.pinnedAt,
      archivedAt: lifecycle.archivedAt,
      trashedAt: lifecycle.trashedAt,
      position,
      revision: 1,
    });

    const itemIds = source.items.map(() => this.idFactory());
    const items = source.items.map((item, index) => {
      const id = itemIds[index];
      if (!id) throw new Error('Failed to allocate a checklist item ID during Keep import.');
      let parentId: string | null = null;
      if (item.parentIndex !== null) {
        parentId = itemIds[item.parentIndex] ?? null;
        if (!parentId) {
          throw new Error('A Keep checklist item references a missing imported parent.');
        }
      }
      return checklistItemRecordSchema.parse({
        id,
        noteId,
        text: item.text,
        checked: item.checked,
        parentId,
        position: index,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      });
    });

    const attachments = includeAttachments
      ? source.attachments.map((attachment) =>
          attachmentRecordSchema.parse({
            id: this.idFactory(),
            noteId,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            checksum: attachment.checksum,
            data: attachment.data,
            createdAt: attachment.createdAt,
          }),
        )
      : [];

    const reminderAt = source.reminderAt ?? null;
    const reminder =
      reminderAt === null
        ? null
        : reminderRecordSchema.parse({
            id: this.idFactory(),
            noteId,
            dueAt: reminderAt,
            timeZone: 'UTC',
            status: 'active',
            createdAt: importedAt,
            updatedAt: importedAt,
            completedAt: null,
            dismissedAt: null,
            lastNotifiedAt: null,
          });

    const revision = revisionRecordSchema.parse({
      id: this.idFactory(),
      noteId,
      noteRevision: 1,
      reason: 'import',
      payload: serializeRevisionSnapshot({
        version: 1,
        type: note.type,
        title: note.title,
        content: note.type === 'text' ? note.content : '',
        color: note.color,
        items: items.map((item) => ({
          id: item.id,
          text: item.text,
          checked: item.checked,
          parentId: item.parentId,
        })),
      }),
      createdAt: Math.max(source.updatedAt, importedAt),
    });

    return { note, items, attachments, reminder, revision };
  }

  private async importedSourceKeys(): Promise<Set<string>> {
    const settings = await this.database.settings.toArray();
    return new Set(
      settings
        .map((setting) => settingRecordSchema.parse(setting).key)
        .filter((key) => key.startsWith(KEEP_IMPORT_LEDGER_PREFIX))
        .map((key) => key.slice(KEEP_IMPORT_LEDGER_PREFIX.length)),
    );
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The import clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

function shouldImportNote(source: PreparedKeepNote, selection: GoogleKeepImportSelection): boolean {
  if (source.trashed) return selection.trashed;
  if (source.archived) return selection.archived;
  return selection.active;
}

function noteSourceIdentities(source: PreparedKeepNote): string[] {
  return [source.sourceKey, ...source.sourceAliases];
}

function ledgerKey(sourceKey: string): string {
  return `${KEEP_IMPORT_LEDGER_PREFIX}${sourceKey}`;
}

function importedLifecycle(source: PreparedKeepNote): {
  pinnedAt: number | null;
  archivedAt: number | null;
  trashedAt: number | null;
} {
  if (source.trashed) {
    return { pinnedAt: null, archivedAt: null, trashedAt: source.updatedAt };
  }
  if (source.archived) {
    return { pinnedAt: null, archivedAt: source.updatedAt, trashedAt: null };
  }
  return {
    pinnedAt: source.pinned ? source.updatedAt : null,
    archivedAt: null,
    trashedAt: null,
  };
}
