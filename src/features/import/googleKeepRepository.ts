import type { NotesDatabase } from '../../db/database';
import {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  normalizeLabelName,
  noteLabelRecordSchema,
  noteRecordSchema,
  revisionRecordSchema,
  serializeRevisionSnapshot,
  settingRecordSchema,
  type AttachmentRecord,
  type ChecklistItemRecord,
  type LabelRecord,
  type NoteLabelRecord,
  type NoteRecord,
  type RevisionRecord,
  type SettingRecord,
} from '../../db';
import {
  KEEP_IMPORT_LEDGER_PREFIX,
  prepareGoogleKeepImport,
  type PreparedKeepImport,
  type PreparedKeepNote,
} from './googleKeepImport';

export interface GoogleKeepImportResult {
  importedNotes: number;
  skippedAlreadyImported: number;
  createdLabels: number;
  importedAttachments: number;
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

  async inspect(files: File[]): Promise<PreparedKeepImport> {
    const existingSourceKeys = await this.importedSourceKeys();
    return prepareGoogleKeepImport(files, existingSourceKeys);
  }

  async importPrepared(prepared: PreparedKeepImport): Promise<GoogleKeepImportResult> {
    return this.database.transaction(
      'rw',
      [
        this.database.notes,
        this.database.checklistItems,
        this.database.labels,
        this.database.noteLabels,
        this.database.attachments,
        this.database.revisions,
        this.database.settings,
      ],
      async () => {
        const importedSourceKeys = await this.importedSourceKeys();
        const notesToImport = prepared.notes.filter(
          (note) => !importedSourceKeys.has(note.sourceKey),
        );
        const skippedAlreadyImported = prepared.notes.length - notesToImport.length;
        if (notesToImport.length === 0) {
          return {
            importedNotes: 0,
            skippedAlreadyImported,
            createdLabels: 0,
            importedAttachments: 0,
          };
        }

        const importTimestamp = this.readClock();
        const existingLabels = (await this.database.labels.toArray()).map((label) =>
          labelRecordSchema.parse(label),
        );
        const labelByNormalized = new Map(
          existingLabels.map((label) => [label.nameNormalized, label]),
        );
        const newLabels: LabelRecord[] = [];
        const notes: NoteRecord[] = [];
        const checklistItems: ChecklistItemRecord[] = [];
        const noteLabels: NoteLabelRecord[] = [];
        const attachments: AttachmentRecord[] = [];
        const revisions: RevisionRecord[] = [];
        const settings: SettingRecord[] = [];

        for (const [position, sourceNote] of notesToImport.entries()) {
          const built = this.buildImportedNote(sourceNote, position, importTimestamp);
          notes.push(built.note);
          checklistItems.push(...built.items);
          attachments.push(...built.attachments);
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
        }

        if (newLabels.length > 0) await this.database.labels.bulkAdd(newLabels);
        await this.database.notes.bulkAdd(notes);
        if (checklistItems.length > 0) await this.database.checklistItems.bulkAdd(checklistItems);
        if (noteLabels.length > 0) await this.database.noteLabels.bulkAdd(noteLabels);
        if (attachments.length > 0) await this.database.attachments.bulkAdd(attachments);
        if (revisions.length > 0) await this.database.revisions.bulkAdd(revisions);
        await this.database.settings.bulkPut(settings);

        return {
          importedNotes: notes.length,
          skippedAlreadyImported,
          createdLabels: newLabels.length,
          importedAttachments: attachments.length,
        };
      },
    );
  }

  private buildImportedNote(source: PreparedKeepNote, position: number, importedAt: number) {
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

    const attachments = source.attachments.map((attachment) =>
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
    );

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

    return { note, items, attachments, revision };
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
