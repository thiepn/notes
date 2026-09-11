import { describe, expect, it } from 'vitest';

import type { LabelRecord } from '../../db';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';
import { buildSearchQuerySuggestions, filterSearchHistory } from './searchSuggestions';

const labels: LabelRecord[] = [
  {
    id: 'label-1',
    name: 'Project Alpha',
    nameNormalized: 'project alpha',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'label-2',
    name: 'French',
    nameNormalized: 'french',
    createdAt: 1,
    updatedAt: 1,
  },
];

describe('buildSearchQuerySuggestions', () => {
  it('offers useful quick searches for an empty query', () => {
    expect(buildSearchQuerySuggestions('', labels).map((item) => item.query)).toEqual([
      'is:pinned',
      'has:reminder',
      'has:image',
      'is:checklist',
    ]);
  });

  it('completes is and has operators in place', () => {
    expect(buildSearchQuerySuggestions('meeting is:pin', labels)[0]?.query).toBe(
      'meeting is:pinned',
    );
    expect(buildSearchQuerySuggestions('has:rem', labels)[0]?.query).toBe('has:reminder');
  });

  it('quotes label names containing spaces', () => {
    expect(buildSearchQuerySuggestions('label:pro', labels)[0]?.query).toBe(
      'label:"Project Alpha"',
    );
  });
});

describe('filterSearchHistory', () => {
  const saved = [
    {
      id: 'saved-1',
      savedAt: 10,
      query: 'project notes',
      filters: { ...DEFAULT_SEARCH_FILTERS },
    },
  ];
  const recent = [
    {
      id: 'recent-duplicate',
      searchedAt: 9,
      query: 'project notes',
      filters: { ...DEFAULT_SEARCH_FILTERS },
    },
    {
      id: 'recent-1',
      searchedAt: 8,
      query: 'french verbs',
      filters: { ...DEFAULT_SEARCH_FILTERS },
    },
  ];

  it('filters history while typing and removes saved-search duplicates from recents', () => {
    const project = filterSearchHistory(saved, recent, 'proj');
    expect(project.saved.map((item) => item.id)).toEqual(['saved-1']);
    expect(project.recent).toEqual([]);

    const french = filterSearchHistory(saved, recent, 'french');
    expect(french.saved).toEqual([]);
    expect(french.recent.map((item) => item.id)).toEqual(['recent-1']);
  });
});
