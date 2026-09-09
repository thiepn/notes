import { describe, expect, it } from 'vitest';

import type { ChecklistItemRecord, NoteRecord } from '../../db';
import { buildMarkdownExportEntries } from './bulkExport';

function note(id: string, title: string, type: NoteRecord['type'] = 'text'): NoteRecord {
  return {
    id,
    type,
    title,
    content: type === 'text' ? `Body ${id}` : '',
    color: 'default',
    createdAt: 1,
    updatedAt: 1,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
  };
}

describe('bulk Markdown export', () => {
  it('creates collision-safe Markdown files for selected notes', () => {
    const entries = buildMarkdownExportEntries(
      [note('one', 'Same title'), note('two', 'Same title')],
      {},
    );
    expect(entries.map((entry) => entry.filename)).toEqual([
      'Same title.md',
      'Same title (2).md',
    ]);
    expect(entries[0]?.markdown).toContain('# Same title');
    expect(entries[0]?.markdown).toContain('Body one');
  });

  it('preserves checklist state and nesting in the archive entries', () => {
    const checklist = note('check', 'Packing', 'checklist');
    const items: ChecklistItemRecord[] = [
      {
        id: 'a',
        noteId: 'check',
        text: 'Passport',
        checked: true,
        parentId: null,
        position: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'b',
        noteId: 'check',
        text: 'Copy',
        checked: false,
        parentId: 'a',
        position: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(buildMarkdownExportEntries([checklist], { check: items })[0]?.markdown).toBe(
      '# Packing\n\n- [x] Passport\n  - [ ] Copy\n',
    );
  });
});
