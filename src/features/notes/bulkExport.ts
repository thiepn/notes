import type { ChecklistItemRecord, NoteRecord } from '../../db';
import { documentFilename, documentMarkdown } from './noteUtilities';

export interface MarkdownExportEntry {
  filename: string;
  markdown: string;
}

export function buildMarkdownExportEntries(
  notes: NoteRecord[],
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>,
): MarkdownExportEntry[] {
  const used = new Set<string>();
  return notes.map((note) => {
    const filename = uniqueFilename(documentFilename(note.title), used);
    used.add(filename.toLocaleLowerCase());
    return {
      filename,
      markdown: documentMarkdown(note, checklistItemsByNote[note.id] ?? []),
    };
  });
}

export async function downloadMarkdownArchive(
  notes: NoteRecord[],
  checklistItemsByNote: Record<string, ChecklistItemRecord[]>,
): Promise<string> {
  if (notes.length === 0) throw new Error('Select at least one note to export.');
  const entries = buildMarkdownExportEntries(notes, checklistItemsByNote);
  const { strToU8, zipSync } = await import('fflate');
  const archive = zipSync(
    Object.fromEntries(entries.map((entry) => [entry.filename, strToU8(entry.markdown)])),
    { level: 6 },
  );
  const filename = `notes-export-${new Date().toISOString().slice(0, 10)}.zip`;
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

function uniqueFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename.toLocaleLowerCase())) return filename;
  const suffix = filename.toLocaleLowerCase().endsWith('.md') ? '.md' : '';
  const stem = suffix ? filename.slice(0, -suffix.length) : filename;
  let copy = 2;
  while (used.has(`${stem} (${copy})${suffix}`.toLocaleLowerCase())) copy += 1;
  return `${stem} (${copy})${suffix}`;
}
