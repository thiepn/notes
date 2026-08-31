import {
  attachmentRecordSchema,
  checklistItemRecordSchema,
  labelRecordSchema,
  noteLabelRecordSchema,
  noteRecordSchema,
  revisionRecordSchema,
  settingRecordSchema,
  type NotesDatabase,
} from '../../db';
import {
  NOTES_BACKUP_FORMAT,
  NOTES_BACKUP_FORMAT_VERSION,
  attachmentToBackup,
  backupDocumentSchema,
  backupStats,
  parseBackupText,
  prepareBackup,
  type BackupDocument,
  type BackupStats,
  type PreparedBackup,
} from './backupFormat';

export interface BackupExport {
  document: BackupDocument;
  json: string;
  stats: BackupStats;
  filename: string;
}

export class BackupRepository {
  constructor(private readonly database: NotesDatabase) {}

  async exportBackup(): Promise<BackupExport> {
    const exportedAt = Date.now();
    const snapshot = await this.database.transaction(
      'r',
      this.database.notes,
      this.database.checklistItems,
      this.database.labels,
      this.database.noteLabels,
      this.database.attachments,
      this.database.revisions,
      this.database.settings,
      async () => {
        const [notes, checklistItems, labels, noteLabels, attachments, revisions, settings] =
          await Promise.all([
            this.database.notes.toArray(),
            this.database.checklistItems.toArray(),
            this.database.labels.toArray(),
            this.database.noteLabels.toArray(),
            this.database.attachments.toArray(),
            this.database.revisions.toArray(),
            this.database.settings.toArray(),
          ]);
        return { notes, checklistItems, labels, noteLabels, attachments, revisions, settings };
      },
    );

    const document = backupDocumentSchema.parse({
      format: NOTES_BACKUP_FORMAT,
      formatVersion: NOTES_BACKUP_FORMAT_VERSION,
      databaseVersion: 1,
      exportedAt,
      data: {
        notes: snapshot.notes.map((record) => noteRecordSchema.parse(record)),
        checklistItems: snapshot.checklistItems.map((record) => checklistItemRecordSchema.parse(record)),
        labels: snapshot.labels.map((record) => labelRecordSchema.parse(record)),
        noteLabels: snapshot.noteLabels.map((record) => noteLabelRecordSchema.parse(record)),
        attachments: await Promise.all(
          snapshot.attachments.map((record) => attachmentToBackup(attachmentRecordSchema.parse(record))),
        ),
        revisions: snapshot.revisions.map((record) => revisionRecordSchema.parse(record)),
        settings: snapshot.settings.map((record) => settingRecordSchema.parse(record)),
      },
    });

    await prepareBackup(document);
    return {
      document,
      json: JSON.stringify(document, null, 2),
      stats: backupStats(document),
      filename: backupFilename(exportedAt),
    };
  }

  inspectBackup(text: string): Promise<PreparedBackup> {
    return parseBackupText(text);
  }

  async restorePrepared(prepared: PreparedBackup): Promise<BackupStats> {
    const verified = await prepareBackup(prepared.document);
    const { data } = verified.document;

    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.checklistItems,
      this.database.labels,
      this.database.noteLabels,
      this.database.attachments,
      this.database.revisions,
      this.database.settings,
      async () => {
        await Promise.all([
          this.database.noteLabels.clear(),
          this.database.checklistItems.clear(),
          this.database.attachments.clear(),
          this.database.revisions.clear(),
          this.database.labels.clear(),
          this.database.settings.clear(),
          this.database.notes.clear(),
        ]);

        if (data.notes.length > 0) await this.database.notes.bulkAdd(data.notes);
        if (data.checklistItems.length > 0) {
          await this.database.checklistItems.bulkAdd(data.checklistItems);
        }
        if (data.labels.length > 0) await this.database.labels.bulkAdd(data.labels);
        if (data.noteLabels.length > 0) await this.database.noteLabels.bulkAdd(data.noteLabels);
        if (verified.attachments.length > 0) {
          await this.database.attachments.bulkAdd(verified.attachments);
        }
        if (data.revisions.length > 0) await this.database.revisions.bulkAdd(data.revisions);
        if (data.settings.length > 0) await this.database.settings.bulkAdd(data.settings);
      },
    );

    return verified.stats;
  }
}

export function backupFilename(timestamp: number, prefix = 'notes-backup'): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:.]/gu, '-');
  return `${prefix}-${stamp}.json`;
}
