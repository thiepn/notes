import { describe, expect, it } from 'vitest';

import { searchSignature, summarizeSearch } from './searchHistory';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

// Temporary content-neutral CI trigger; reverted in the next commit.
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
