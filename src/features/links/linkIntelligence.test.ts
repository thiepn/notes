import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  analyzeNoteConnections,
  findUnlinkedMentions,
  linkUnlinkedMentions,
  normalizeWikiTitle,
  parseWikiLinks,
  resolveWikiLink,
} from './linkIntelligence';

function note(
  id: string,
  title: string,
  content = '',
  patch: Partial<NoteRecord> = {},
): NoteRecord {
  return {
    id,
    type: 'text',
    title,
    content,
    color: 'default',
    position: 0,
    createdAt: 1,
    updatedAt: Number(id.replace(/\D/gu, '')) || 1,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    revision: 1,
    ...patch,
  };
}

describe('V2-3 link intelligence', () => {
  it('normalizes title identity without erasing meaningful accents', () => {
    expect(normalizeWikiTitle('  Café   Notes  ')).toBe('café notes');
    expect(normalizeWikiTitle('Cafe Notes')).not.toBe(normalizeWikiTitle('Café Notes'));
  });

  it('parses wiki links but ignores code', () => {
    expect(
      parseWikiLinks('Read [[Project Atlas]] and `[[literal]]`.\n```\n[[blocked]]\n```'),
    ).toEqual([{ title: 'Project Atlas', start: 5, end: 22 }]);
  });

  it('resolves unique titles and exposes missing and duplicate targets explicitly', () => {
    const library = [note('n1', 'Project Atlas'), note('n2', 'Other')];
    expect(resolveWikiLink(' project   atlas ', library)).toMatchObject({
      status: 'resolved',
      noteId: 'n1',
    });
    expect(resolveWikiLink('Missing', library).status).toBe('missing');

    const duplicateLibrary = [...library, note('n3', 'PROJECT ATLAS')];
    expect(resolveWikiLink('Project Atlas', duplicateLibrary).status).toBe('ambiguous');
  });

  it('derives outgoing links, backlinks, and unlinked mentions without stored edges', () => {
    const atlas = note('n1', 'Project Atlas', 'Owner note');
    const explicit = note('n2', 'Meeting', 'Discuss [[Project Atlas]] tomorrow.');
    const plain = note('n3', 'Research', 'Project Atlas needs another source.');
    const library = [atlas, explicit, plain];

    const connections = analyzeNoteConnections(atlas, library);
    expect(connections.backlinks.map((item) => item.note.id)).toEqual(['n2']);
    expect(connections.unlinkedMentions.map((item) => item.note.id)).toEqual(['n3']);
    expect(analyzeNoteConnections(explicit, library).outgoing[0]).toMatchObject({
      title: 'Project Atlas',
      count: 1,
      resolution: { status: 'resolved', noteId: 'n1' },
    });
  });

  it('does not report mentions already linked, in Markdown links, or in code', () => {
    const target = note('n1', 'Project Atlas');
    const source = note(
      'n2',
      'Source',
      '[[Project Atlas]]\n[Project Atlas](https://example.com)\n`Project Atlas`\n```\nProject Atlas\n```',
    );
    expect(findUnlinkedMentions(target, [target, source])).toEqual([]);
  });

  it('converts every safe mention in one source while preserving protected ranges', () => {
    const content =
      'Project Atlas is active. `Project Atlas` stays literal. Project Atlas again. [[Project Atlas]] stays linked.';
    expect(linkUnlinkedMentions(content, 'Project Atlas')).toBe(
      '[[Project Atlas]] is active. `Project Atlas` stays literal. [[Project Atlas]] again. [[Project Atlas]] stays linked.',
    );
  });

  it('suppresses auto-link discovery when a title is ambiguous', () => {
    const first = note('n1', 'Atlas');
    const second = note('n2', 'ATLAS');
    const source = note('n3', 'Source', 'Atlas is mentioned here.');
    expect(findUnlinkedMentions(first, [first, second, source])).toEqual([]);
  });
});
