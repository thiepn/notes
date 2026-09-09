import type { ChecklistItemRecord, NoteRecord } from '../../db';

export function documentFilename(title: string): string {
  const normalized = title.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').trim();
  let clean = '';
  const encoder = new TextEncoder();
  for (const point of normalized) {
    if (encoder.encode(clean + point).length > 180) break;
    clean += point;
  }
  clean = clean.replace(/[. ]+$/, '') || 'Untitled note';
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `Note-${clean}` : clean}.md`;
}
export type ExportChecklistItem = Pick<ChecklistItemRecord, 'id' | 'text' | 'checked' | 'parentId'>;
export function documentMarkdown(
  note: Pick<NoteRecord, 'type' | 'title' | 'content'>,
  items: ExportChecklistItem[] = [],
): string {
  const heading = note.title.trim() ? `# ${note.title.trim()}\n\n` : '';
  if (note.type !== 'checklist') return `${heading}${note.content}\n`;
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    heading +
    items
      .map((item) => {
        let parent = item.parentId;
        let depth = 0;
        const seen = new Set([item.id]);
        while (parent && byId.has(parent) && !seen.has(parent) && depth < 20) {
          seen.add(parent);
          depth += 1;
          parent = byId.get(parent)!.parentId;
        }
        return `${'  '.repeat(depth)}- [${item.checked ? 'x' : ' '}] ${item.text.replace(/\n/g, '\n  ')}`;
      })
      .join('\n') +
    '\n'
  );
}
export function downloadDocument(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
