import type { NotesDatabase } from '../database';
import { nextTimestamp } from '../clock';
import { NoteNotFoundError } from '../errors';
import type { LabelRecord, NoteLabelRecord } from '../types';
import { labelRecordSchema, noteLabelRecordSchema } from '../validation';

interface LabelsRepositoryOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export class LabelsRepository {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly database: NotesDatabase,
    options: LabelsRepositoryOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async list(): Promise<LabelRecord[]> {
    const labels = await this.database.labels.toArray();
    return labels.map((label) => labelRecordSchema.parse(label)).sort(compareLabels);
  }

  async get(id: string): Promise<LabelRecord | undefined> {
    const label = await this.database.labels.get(id);
    return label ? labelRecordSchema.parse(label) : undefined;
  }

  async create(name: string): Promise<LabelRecord> {
    const displayName = normalizeDisplayName(name);
    const nameNormalized = normalizeLabelName(displayName);
    const existing = await this.database.labels.where('nameNormalized').equals(nameNormalized).first();
    if (existing) throw new Error(`A label named “${displayName}” already exists.`);

    const timestamp = this.readClock();
    const label = labelRecordSchema.parse({
      id: this.idFactory(),
      name: displayName,
      nameNormalized,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.database.labels.add(label);
    return label;
  }

  async rename(id: string, name: string): Promise<LabelRecord> {
    const displayName = normalizeDisplayName(name);
    const nameNormalized = normalizeLabelName(displayName);

    return this.database.transaction('rw', this.database.labels, async () => {
      const rawCurrent = await this.database.labels.get(id);
      if (!rawCurrent) throw new Error('Label not found.');
      const current = labelRecordSchema.parse(rawCurrent);
      if (current.name === displayName && current.nameNormalized === nameNormalized) return current;

      const existing = await this.database.labels.where('nameNormalized').equals(nameNormalized).first();
      if (existing && existing.id !== id) {
        throw new Error(`A label named “${displayName}” already exists.`);
      }

      const next = labelRecordSchema.parse({
        ...current,
        name: displayName,
        nameNormalized,
        updatedAt: nextTimestamp(current.updatedAt, this.readClock()),
      });
      await this.database.labels.put(next);
      return next;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.database.transaction('rw', this.database.labels, this.database.noteLabels, async () => {
      const exists = await this.database.labels.get(id);
      if (!exists) return false;
      await this.database.noteLabels.where('labelId').equals(id).delete();
      await this.database.labels.delete(id);
      return true;
    });
  }

  async labelIdsForNote(noteId: string): Promise<string[]> {
    const links = await this.database.noteLabels.where('noteId').equals(noteId).toArray();
    return links.map((link) => noteLabelRecordSchema.parse(link).labelId);
  }

  async labelIdsByNote(noteIds: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = Object.fromEntries(noteIds.map((id) => [id, []]));
    if (noteIds.length === 0) return result;

    const noteIdSet = new Set(noteIds);
    const links = await this.database.noteLabels.toArray();
    for (const rawLink of links) {
      const link = noteLabelRecordSchema.parse(rawLink);
      if (noteIdSet.has(link.noteId)) result[link.noteId]?.push(link.labelId);
    }
    return result;
  }

  async noteIdsForLabel(labelId: string): Promise<string[]> {
    const links = await this.database.noteLabels.where('labelId').equals(labelId).toArray();
    return links.map((link) => noteLabelRecordSchema.parse(link).noteId);
  }

  async assign(noteId: string, labelId: string): Promise<NoteLabelRecord> {
    return this.database.transaction(
      'rw',
      this.database.notes,
      this.database.labels,
      this.database.noteLabels,
      async () => {
        if (!(await this.database.notes.get(noteId))) throw new NoteNotFoundError(noteId);
        if (!(await this.database.labels.get(labelId))) throw new Error('Label not found.');

        const key: [string, string] = [noteId, labelId];
        const existing = await this.database.noteLabels.get(key);
        if (existing) return noteLabelRecordSchema.parse(existing);

        const link = noteLabelRecordSchema.parse({
          noteId,
          labelId,
          assignedAt: this.readClock(),
        });
        await this.database.noteLabels.add(link);
        return link;
      },
    );
  }

  async unassign(noteId: string, labelId: string): Promise<boolean> {
    const key: [string, string] = [noteId, labelId];
    const existing = await this.database.noteLabels.get(key);
    if (!existing) return false;
    await this.database.noteLabels.delete(key);
    return true;
  }

  async setForNote(noteId: string, labelIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(labelIds)];
    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.labels,
      this.database.noteLabels,
      async () => {
        if (!(await this.database.notes.get(noteId))) throw new NoteNotFoundError(noteId);
        const labels = await this.database.labels.bulkGet(uniqueIds);
        if (labels.some((label) => label === undefined)) {
          throw new Error('One or more labels no longer exist.');
        }

        await this.database.noteLabels.where('noteId').equals(noteId).delete();
        if (uniqueIds.length === 0) return;

        const assignedAt = this.readClock();
        await this.database.noteLabels.bulkAdd(
          uniqueIds.map((labelId) => noteLabelRecordSchema.parse({ noteId, labelId, assignedAt })),
        );
      },
    );
  }

  private readClock(): number {
    const timestamp = this.clock();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new RangeError('The database clock must return a non-negative safe integer.');
    }
    return timestamp;
  }
}

export function normalizeLabelName(name: string): string {
  return normalizeDisplayName(name).normalize('NFKC').toLocaleLowerCase();
}

function normalizeDisplayName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new Error('Label name cannot be empty.');
  if (normalized.length > 100) throw new Error('Label name must be 100 characters or fewer.');
  return normalized;
}

function compareLabels(a: LabelRecord, b: LabelRecord): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
