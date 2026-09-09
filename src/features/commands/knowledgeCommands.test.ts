import { describe, expect, it } from 'vitest';

import { quickOpenTerms, rankQuickOpenNotes, type QuickOpenNote } from './knowledgeCommands';

function note(
  id: string,
  title: string,
  updatedAt: number,
  archivedAt: number | null = null,
): QuickOpenNote {
  return {
    id,
    title,
    type: 'text',
    updatedAt,
    archivedAt,
    trashedAt: null,
  };
}

describe('knowledge command ranking', () => {
  it('ranks exact and prefix title matches ahead of broad term matches', () => {
    const results = rankQuickOpenNotes(
      [
        note('broad', 'Atlas Project Notes', 30),
        note('prefix', 'Project Atlas Roadmap', 20),
        note('exact', 'Project Atlas', 10),
      ],
      'project atlas',
    );

    expect(results.map((result) => result.note.id)).toEqual(['exact', 'prefix', 'broad']);
  });

  it('treats command-intent words as navigation syntax and remains accent insensitive', () => {
    const results = rankQuickOpenNotes(
      [note('cafe', 'Café Überblick', 10), note('other', 'Other note', 20)],
      'open cafe uberblick',
    );

    expect(quickOpenTerms('open cafe uberblick')).toEqual(['cafe', 'uberblick']);
    expect(results.map((result) => result.note.id)).toEqual(['cafe']);
  });

  it('excludes trashed notes and uses recency to break equal relevance', () => {
    const trashed: QuickOpenNote = { ...note('trashed', 'Mission Plan', 100), trashedAt: 99 };
    const results = rankQuickOpenNotes(
      [note('old', 'Mission Plan Draft', 10), note('new', 'Mission Plan Review', 20), trashed],
      'mission plan',
    );

    expect(results.map((result) => result.note.id)).toEqual(['new', 'old']);
  });
});
