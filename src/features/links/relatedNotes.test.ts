import { describe, expect, it } from 'vitest';

import type { LabelRecord, NoteRecord } from '../../db';
import {
  findRelatedNotes,
  suggestLabelsForNote,
  summarizeLocalTopics,
} from './relatedNotes';

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

function label(id: string, name: string): LabelRecord {
  return {
    id,
    name,
    nameNormalized: name.normalize('NFKC').toLocaleLowerCase(),
    createdAt: 1,
    updatedAt: 1,
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
    expect(result?.duplicateReason).toBe('Same title and content');
    expect(result?.score).toBeGreaterThan(0.8);
  });

  it('does not call notes duplicates from a shared generic title alone', () => {
    const source = note('source', 'Meeting notes', 'Budget planning roadmap launch operations');
    const candidate = note('candidate', 'Meeting notes', 'Choir rehearsal songs prayer schedule');

    const result = findRelatedNotes(source, [candidate]);

    expect(result[0]?.duplicate).not.toBe(true);
  });

  it('uses shared labels as a deterministic relatedness signal even without lexical overlap', () => {
    const project = label('project', 'Project');
    const source = note('source', 'Launch', 'Budget milestones owners');
    const candidate = note('candidate', 'Retrospective', 'Lessons risks follow up');

    const [result] = findRelatedNotes(source, [candidate], 5, {
      labels: [project],
      labelIdsByNote: { source: ['project'], candidate: ['project'] },
    });

    expect(result?.note.id).toBe('candidate');
    expect(result?.sharedLabels).toEqual(['Project']);
    expect(result?.score).toBeGreaterThanOrEqual(0.16);
  });

  it('uses shared resolved WikiLink targets as a local neighborhood signal', () => {
    const hub = note('hub', 'Reference Hub', 'Canonical material');
    const source = note('source', 'Alpha', 'Review [[Reference Hub]] before Friday.');
    const candidate = note('candidate', 'Beta', 'Follow [[Reference Hub]] after the meeting.');

    const [result] = findRelatedNotes(source, [source, candidate, hub]);

    expect(result?.note.id).toBe('candidate');
    expect(result?.sharedLinkTargets).toEqual(['Reference Hub']);
  });

  it('ignores the source note, trashed notes, and empty documents', () => {
    const source = note(
      'source',
      'Mission planning',
      'Travel logistics language study preparation',
    );
    const trashed = note(
      'trash',
      'Mission planning',
      'Travel logistics language study preparation',
      {
        trashedAt: 2,
      },
    );
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
    const source = note(
      'source',
      'Notes architecture',
      'local first notes architecture storage sync',
    );
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

describe('P15 local label and topic intelligence', () => {
  it('suggests an existing label supported by multiple related notes', () => {
    const study = label('study', 'Study');
    const source = note('source', 'Analysis exam', 'integrals sequences convergence proof');
    const first = note('first', 'Analysis exercises', 'integrals convergence proof practice');
    const second = note('second', 'Exam review', 'sequences convergence proof summary');
    const relations = findRelatedNotes(source, [first, second], 8, {
      labels: [study],
      labelIdsByNote: { first: ['study'], second: ['study'] },
    });

    const suggestions = suggestLabelsForNote(
      source,
      relations,
      [study],
      { first: ['study'], second: ['study'] },
      4,
    );

    expect(suggestions[0]).toMatchObject({
      label: { id: 'study', name: 'Study' },
      support: 2,
      directMatch: false,
    });
  });

  it('can suggest a label whose name directly appears in the note without inventing labels', () => {
    const french = label('french', 'French');
    const source = note('source', 'French review', 'Practice vocabulary and listening today.');

    expect(suggestLabelsForNote(source, [], [french], {}, 4)).toEqual([
      expect.objectContaining({
        label: french,
        directMatch: true,
      }),
    ]);
  });

  it('summarizes recurring labels and shared terms as local topics', () => {
    const math = label('math', 'Math');
    const source = note('source', 'Jordan form', 'matrix eigenvalue basis');
    const first = note('first', 'Jordan matrix', 'matrix eigenvalue basis');
    const second = note('second', 'Matrix basis', 'matrix eigenvalue proof');
    const relations = findRelatedNotes(source, [first, second], 8, {
      labels: [math],
      labelIdsByNote: { source: ['math'], first: ['math'], second: ['math'] },
    });

    const topics = summarizeLocalTopics(
      source,
      relations,
      [math],
      { source: ['math'], first: ['math'], second: ['math'] },
      5,
    );

    expect(topics).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Math' })]));
    expect(topics.some((topic) => topic.kind === 'term')).toBe(true);
  });
});
