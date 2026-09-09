import { describe, expect, it } from 'vitest';

import { pruneSearchFiltersToLabels, searchSignature, summarizeSearch } from './searchHistory';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

describe('search history helpers', () => {
  it('treats color and label selection order as the same saved search', () => {
    const first = searchSignature({
      query: 'mission',
      filters: {
        ...DEFAULT_SEARCH_FILTERS,
        colors: ['yellow', 'blue'],
        labelIds: ['b', 'a'],
      },
    });
    const second = searchSignature({
      query: ' mission ',
      filters: {
        ...DEFAULT_SEARCH_FILTERS,
        colors: ['blue', 'yellow'],
        labelIds: ['a', 'b'],
      },
    });
    expect(first).toBe(second);
  });

  it('removes deleted label references without changing other filters', () => {
    const filters = {
      ...DEFAULT_SEARCH_FILTERS,
      type: 'checklist' as const,
      labelIds: ['keep', 'delete', 'keep-two'],
    };
    expect(pruneSearchFiltersToLabels(filters, new Set(['keep', 'keep-two']))).toEqual({
      ...filters,
      labelIds: ['keep', 'keep-two'],
    });
    expect(pruneSearchFiltersToLabels(filters, new Set(filters.labelIds))).toBe(filters);
  });

  it('summarizes filter-only saved searches without inventing label names', () => {
    expect(
      summarizeSearch({
        query: '',
        filters: {
          ...DEFAULT_SEARCH_FILTERS,
          type: 'checklist',
          status: 'archived',
          labelIds: ['one', 'two'],
        },
      }),
    ).toEqual({ title: 'Filtered search', detail: 'Checklist · Archived · 2 labels' });
  });
});
