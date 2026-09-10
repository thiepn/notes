import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import { findRelatedNotes } from './relatedNotes';

function note(
  id: string,
  title: string,
  content: string,
  overrides: Partial<NoteRecord> = {},
): NoteRecord {
  return {
    id,
    type: 'text',
    title,
    content,
    color: 'default',
    createdAt: 1,
    updatedAt: 1,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
    ...overrides,
  };
}

describe('findRelatedNotes', () => {
  it('ranks shared concepts above unrelated notes', () => {
    const source = note(
      'source',
      'Linear algebra exam',
      'Jordan form eigenvalues eigenvectors matrix basis similarity transformation',
    );
    const related = note(
      'related',
      'Jordan form notes',
      'Matrix eigenvalues basis diagonalization and similarity transformation',
    );
    const unrelated = note(
      'unrelated',
      'French groceries',
      'baguette fromage marché déjeuner cuisine',
    );

    const result = findRelatedNotes(source, [unrelated, related, source]);

    expect(result.map(({ note: candidate }) => candidate.id)).toEqual(['related']);
    expect(result[0]?.sharedTerms).toEqual(expect.arrayContaining(['jordan', 'form']));
  });

  it('flags exact and very close local duplicates', () => {
    const source = note('source', 'Project plan', 'Ship the offline notes application this week.');
    const duplicate = note(
      'duplicate',
      '  PROJECT PLAN ',
      'Ship the offline notes application this week.',
    );

    const [result] = findRelatedNotes(source, [duplicate]);

    expect(result?.duplicate).toBe(true);
    expect(result?.score).toBeGreaterThan(0.8);
  });

  it('ignores the source note, trashed notes, and empty documents', () => {
    const source = note('source', 'Mission planning', 'Travel logistics language study preparation');
    const trashed = note('trash', 'Mission planning', 'Travel logistics language study preparation', {
      trashedAt: 2,
    });
    const empty = note('empty', '', '');

    expect(findRelatedNotes(source, [source, trashed, empty])).toEqual([]);
  });

  it('normalizes Unicode case and punctuation without requiring English text', () => {
    const source = note('source', '성경 공부 계획', '마가복음 읽기 계획과 성경 공부 기록');
    const related = note('related', '성경 공부 기록', '성경 공부 계획 정리');

    const [result] = findRelatedNotes(source, [related]);

    expect(result?.note.id).toBe('related');
    expect(result?.sharedTerms.length).toBeGreaterThan(0);
  });

  it('respects the requested result limit deterministically', () => {
    const source = note('source', 'Notes architecture', 'local first notes architecture storage sync');
    const candidates = Array.from({ length: 8 }, (_, index) =>
      note(
        `candidate-${index}`,
        `Notes architecture ${index}`,
        `local first notes architecture storage sync detail ${index}`,
        { updatedAt: index + 1 },
      ),
    );

    expect(findRelatedNotes(source, candidates, 3)).toHaveLength(3);
    expect(findRelatedNotes(source, candidates, 0)).toEqual([]);
  });
});
