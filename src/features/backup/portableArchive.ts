import type { BackupDocument } from './backupFormat';
import { prepareBackup } from './backupFormat';
import { documentMarkdown } from '../notes/noteUtilities';

export const NOTES_PORTABLE_FORMAT = 'thiepn.notes.portable';
export const NOTES_PORTABLE_FORMAT_VERSION = 1;

export interface PortableAttachmentEntry {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  sourceChecksum: string;
  sha256: string;
  createdAt: number;
}

export interface PortableLabelEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface PortableReminderEntry {
  id: string;
  dueAt: number;
  timeZone: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  dismissedAt: number | null;
  lastNotifiedAt: number | null;
}

export interface PortableNoteEntry {
  id: string;
  path: string;
  title: string;
  type: 'text' | 'checklist';
  lifecycle: 'active' | 'archived' | 'trashed';
  color: string;
  createdAt: number;
  updatedAt: number;
  pinnedAt: number | null;
  archivedAt: number | null;
  trashedAt: number | null;
  position: number;
  revision: number;
  labels: string[];
  reminder: PortableReminderEntry | null;
  attachments: PortableAttachmentEntry[];
}

export interface PortableArchiveManifest {
  format: typeof NOTES_PORTABLE_FORMAT;
  formatVersion: typeof NOTES_PORTABLE_FORMAT_VERSION;
  exportedAt: number;
  source: {
    backupFormat: string;
    backupFormatVersion: number;
    databaseVersion: number;
  };
  counts: {
    notes: number;
    active: number;
    archived: number;
    trashed: number;
    checklistItems: number;
    labels: number;
    attachments: number;
    reminders: number;
  };
  labels: PortableLabelEntry[];
  notes: PortableNoteEntry[];
}

export interface PortableArchiveBuild {
  manifest: PortableArchiveManifest;
  files: Record<string, Uint8Array>;
}

export interface PortableArchiveDownload {
  filename: string;
  byteLength: number;
  manifest: PortableArchiveManifest;
}

export async function buildPortableArchive(document: BackupDocument): Promise<PortableArchiveBuild> {
  const prepared = await prepareBackup(document);
  const { data } = prepared.document;
  const encoder = new TextEncoder();

  const checklistByNote = new Map<string, typeof data.checklistItems>();
  for (const item of data.checklistItems) {
    const list = checklistByNote.get(item.noteId) ?? [];
    list.push(item);
    checklistByNote.set(item.noteId, list);
  }
  for (const list of checklistByNote.values()) {
    list.sort(
      (a, b) => a.position - b.position || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  }

  const labelNameById = new Map(data.labels.map((label) => [label.id, label.name]));
  const labelsByNote = new Map<string, string[]>();
  for (const relation of data.noteLabels) {
    const name = labelNameById.get(relation.labelId);
    if (!name) continue;
    const labels = labelsByNote.get(relation.noteId) ?? [];
    labels.push(name);
    labelsByNote.set(relation.noteId, labels);
  }
  for (const labels of labelsByNote.values()) labels.sort((a, b) => a.localeCompare(b));

  const reminderByNote = new Map(data.reminders.map((reminder) => [reminder.noteId, reminder]));
  const attachmentMetadataByNote = new Map<string, typeof data.attachments>();
  for (const attachment of data.attachments) {
    const list = attachmentMetadataByNote.get(attachment.noteId) ?? [];
    list.push(attachment);
    attachmentMetadataByNote.set(attachment.noteId, list);
  }
  for (const list of attachmentMetadataByNote.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }
  const attachmentBlobById = new Map(
    prepared.attachments.map((attachment) => [attachment.id, attachment]),
  );

  const files: Record<string, Uint8Array> = {};
  const manifestNotes: PortableNoteEntry[] = [];
  const sortedNotes = [...data.notes].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );

  for (const note of sortedNotes) {
    const notePath = `notes/${portableNoteFilename(note.title, note.id)}`;
    const labels = labelsByNote.get(note.id) ?? [];
    const reminder = reminderByNote.get(note.id) ?? null;
    const attachmentEntries: PortableAttachmentEntry[] = [];
    const attachmentLinks: string[] = [];

    for (const attachment of attachmentMetadataByNote.get(note.id) ?? []) {
      const source = attachmentBlobById.get(attachment.id);
      if (!source) throw new Error(`Portable export is missing attachment ${attachment.id}.`);
      const filename = portableAttachmentFilename(
        attachment.name,
        attachment.id,
        attachment.mimeType,
      );
      const path = `attachments/${note.id}/${filename}`;
      if (files[path]) throw new Error(`Portable export generated a duplicate path: ${path}`);
      files[path] = new Uint8Array(await source.data.arrayBuffer());
      attachmentEntries.push({
        id: attachment.id,
        path,
        name: attachment.name ?? filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        sourceChecksum: attachment.checksum,
        sha256: attachment.dataSha256,
        createdAt: attachment.createdAt,
      });
      attachmentLinks.push(
        `- [${escapeMarkdownLinkLabel(attachment.name ?? filename)}](../${path})`,
      );
    }

    const body = documentMarkdown(note, checklistByNote.get(note.id) ?? []);
    files[notePath] = encoder.encode(
      portableNoteMarkdown(note, labels, reminder, body, attachmentLinks),
    );

    manifestNotes.push({
      id: note.id,
      path: notePath,
      title: note.title,
      type: note.type,
      lifecycle: noteLifecycle(note),
      color: note.color,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      pinnedAt: note.pinnedAt,
      archivedAt: note.archivedAt,
      trashedAt: note.trashedAt,
      position: note.position,
      revision: note.revision,
      labels: [...labels],
      reminder: reminder
        ? {
            id: reminder.id,
            dueAt: reminder.dueAt,
            timeZone: reminder.timeZone,
            status: reminder.status,
            createdAt: reminder.createdAt,
            updatedAt: reminder.updatedAt,
            completedAt: reminder.completedAt,
            dismissedAt: reminder.dismissedAt,
            lastNotifiedAt: reminder.lastNotifiedAt,
          }
        : null,
      attachments: attachmentEntries,
    });
  }

  const counts = {
    notes: data.notes.length,
    active: data.notes.filter((note) => note.archivedAt === null && note.trashedAt === null).length,
    archived: data.notes.filter((note) => note.archivedAt !== null && note.trashedAt === null).length,
    trashed: data.notes.filter((note) => note.trashedAt !== null).length,
    checklistItems: data.checklistItems.length,
    labels: data.labels.length,
    attachments: data.attachments.length,
    reminders: data.reminders.length,
  };
  const manifest: PortableArchiveManifest = {
    format: NOTES_PORTABLE_FORMAT,
    formatVersion: NOTES_PORTABLE_FORMAT_VERSION,
    exportedAt: prepared.document.exportedAt,
    source: {
      backupFormat: prepared.document.format,
      backupFormatVersion: prepared.document.formatVersion,
      databaseVersion: prepared.document.databaseVersion,
    },
    counts,
    labels: [...data.labels]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((label) => ({
        id: label.id,
        name: label.name,
        createdAt: label.createdAt,
        updatedAt: label.updatedAt,
      })),
    notes: manifestNotes,
  };

  files['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2));
  files['README.md'] = encoder.encode(portableReadme(manifest));
  return { manifest, files };
}

export async function downloadPortableArchive(
  backupDocument: BackupDocument,
): Promise<PortableArchiveDownload> {
  const built = await buildPortableArchive(backupDocument);
  const { zipSync } = await import('fflate');
  const archive = zipSync(built.files, { level: 6 });
  const filename = portableArchiveFilename(built.manifest.exportedAt);
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const anchor = documentCreateAnchor(url, filename);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, byteLength: archive.byteLength, manifest: built.manifest };
}

export function portableArchiveFilename(timestamp: number): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:.]/gu, '-');
  return `notes-portable-${stamp}.zip`;
}

export function portableNoteFilename(title: string, id: string): string {
  const stem = portablePathSegment(title.trim() || 'Untitled note', 120);
  return `${stem}--${id.slice(0, 8)}.md`;
}

function portableAttachmentFilename(name: string | null, id: string, mimeType: string): string {
  const suffix = `--${id.slice(0, 8)}`;
  if (!name?.trim()) return `attachment${suffix}${extensionForMimeType(mimeType)}`;

  const clean = portablePathSegment(name, 120);
  const lastDot = clean.lastIndexOf('.');
  if (lastDot > 0 && lastDot < clean.length - 1 && clean.length - lastDot <= 16) {
    return `${clean.slice(0, lastDot)}${suffix}${clean.slice(lastDot)}`;
  }
  return `${clean}${suffix}${extensionForMimeType(mimeType)}`;
}

function portablePathSegment(value: string, maxBytes: number): string {
  const normalized = value.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').replace(/[. ]+$/u, '').trim();
  const base = normalized || 'Untitled';
  const encoder = new TextEncoder();
  let result = '';
  for (const point of base) {
    if (encoder.encode(result + point).length > maxBytes) break;
    result += point;
  }
  result = result.replace(/[. ]+$/u, '') || 'Untitled';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(result)) {
    result = `Note-${result}`;
  }
  return result;
}

function portableNoteMarkdown(
  note: BackupDocument['data']['notes'][number],
  labels: string[],
  reminder: BackupDocument['data']['reminders'][number] | null,
  body: string,
  attachmentLinks: string[],
): string {
  const frontmatter = [
    '---',
    `notesFormat: ${JSON.stringify('thiepn.notes.portable-note')}`,
    `noteId: ${JSON.stringify(note.id)}`,
    `type: ${JSON.stringify(note.type)}`,
    `lifecycle: ${JSON.stringify(noteLifecycle(note))}`,
    `color: ${JSON.stringify(note.color)}`,
    `createdAt: ${JSON.stringify(new Date(note.createdAt).toISOString())}`,
    `updatedAt: ${JSON.stringify(new Date(note.updatedAt).toISOString())}`,
    `pinnedAt: ${note.pinnedAt === null ? 'null' : JSON.stringify(new Date(note.pinnedAt).toISOString())}`,
    `archivedAt: ${note.archivedAt === null ? 'null' : JSON.stringify(new Date(note.archivedAt).toISOString())}`,
    `trashedAt: ${note.trashedAt === null ? 'null' : JSON.stringify(new Date(note.trashedAt).toISOString())}`,
    `labels: ${JSON.stringify(labels)}`,
    `reminder: ${JSON.stringify(
      reminder
        ? {
            id: reminder.id,
            dueAt: new Date(reminder.dueAt).toISOString(),
            timeZone: reminder.timeZone,
            status: reminder.status,
            createdAt: new Date(reminder.createdAt).toISOString(),
            updatedAt: new Date(reminder.updatedAt).toISOString(),
            completedAt:
              reminder.completedAt === null
                ? null
                : new Date(reminder.completedAt).toISOString(),
            dismissedAt:
              reminder.dismissedAt === null
                ? null
                : new Date(reminder.dismissedAt).toISOString(),
            lastNotifiedAt:
              reminder.lastNotifiedAt === null
                ? null
                : new Date(reminder.lastNotifiedAt).toISOString(),
          }
        : null,
    )}`,
    '---',
    '',
  ].join('\n');
  const attachments =
    attachmentLinks.length > 0 ? `\n## Attachments\n\n${attachmentLinks.join('\n')}\n` : '';
  return `${frontmatter}${body.trimEnd()}\n${attachments}`;
}

function noteLifecycle(
  note: BackupDocument['data']['notes'][number],
): 'active' | 'archived' | 'trashed' {
  if (note.trashedAt !== null) return 'trashed';
  if (note.archivedAt !== null) return 'archived';
  return 'active';
}

function portableReadme(manifest: PortableArchiveManifest): string {
  return `# Notes portable archive\n\nThis ZIP is a human-readable export of a Notes library. It is designed for inspection, migration, and long-term portability rather than exact in-app disaster recovery.\n\n- Exported: ${new Date(manifest.exportedAt).toISOString()}\n- Notes: ${manifest.counts.notes} (${manifest.counts.active} active, ${manifest.counts.archived} archived, ${manifest.counts.trashed} trashed)\n- Checklist rows: ${manifest.counts.checklistItems}\n- Labels: ${manifest.counts.labels}\n- Attachments: ${manifest.counts.attachments}\n- Reminders: ${manifest.counts.reminders}\n\n## Layout\n\n- \`notes/\` contains one Markdown file per note, including YAML-compatible front matter with IDs, timestamps, lifecycle state, labels, and reminder metadata.\n- \`attachments/\` contains original attachment bytes grouped by note ID.\n- \`manifest.json\` records label definitions, every note path, full reminder metadata, and attachment identity/checksum information.\n\nUse the separate full Notes JSON backup for exact restore into Notes. The portable archive intentionally excludes internal revision history and database settings.\n`;
}

function extensionForMimeType(mimeType: string): string {
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'text/plain': '.txt',
  };
  return known[mimeType] ?? '';
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/([\\[\]])/gu, '\\$1');
}

function documentCreateAnchor(url: string, filename: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  return anchor;
}
