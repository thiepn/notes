import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  normalizeSearchText,
  parseSearchQuery,
  searchDocuments,
  type SearchDocument,
} from './searchEngine';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    title: '',
    content: '',
    color: 'default',
    createdAt: 100,
    updatedAt: 100,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
    ...overrides,
  };
}

function document(
  input: {
    note?: NoteRecord;
    title?: string;
    body?: string;
    checklist?: string;
    labelNames?: string[];
    labelIds?: string[];
    hasImage?: boolean;
    hasLink?: boolean;
  } = {},
): SearchDocument {
  const record = input.note ?? note({ title: input.title ?? '', content: input.body ?? '' });
  const normalizedTitle = normalizeSearchText(record.title);
  const normalizedBody = normalizeSearchText(record.content);
  const normalizedChecklist = normalizeSearchText(input.checklist ?? '');
  const normalizedLabels = normalizeSearchText((input.labelNames ?? []).join(' '));
  return {
    note: record,
    checklistItems: [],
    labelIds: input.labelIds ?? [],
    labelNames: input.labelNames ?? [],
    hasImage: input.hasImage ?? false,
    hasLink: input.hasLink ?? false,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAll: [normalizedTitle, normalizedBody, normalizedChecklist, normalizedLabels]
      .filter(Boolean)
      .join(' '),
  };
}

describe('normalizeSearchText', () => {
  it('normalizes case, accents, punctuation, whitespace, and German sharp s', () => {
    expect(normalizeSearchText('  Über—Straße, CAFÉ!  ')).toBe('uber strasse cafe');
  });

  it('preserves non-Latin letters for multilingual matching', () => {
    expect(normalizeSearchText('성경 공부 / 日本語')).toBe('성경 공부 日本語');
  });
});

describe('parseSearchQuery', () => {
  it('parses operators and quoted label values', () => {
    const parsed = parseSearchQuery(
      'mission label:"Bible Study" is:pinned is:checklist has:image has:link before:2026-09-01 after:2026-08-01',
    );
    expect(parsed.terms).toEqual(['mission']);
    expect(parsed.labelNames).toEqual(['bible study']);
    expect(parsed.statuses).toEqual(['pinned']);
    expect(parsed.types).toEqual(['checklist']);
    expect(parsed.requireImage).toBe(true);
    expect(parsed.requireLink).toBe(true);
    expect(parsed.before).not.toBeNull();
    expect(parsed.after).not.toBeNull();
    expect(parsed.errors).toEqual([]);
  });

  it('reports malformed date operators without crashing the query', () => {
    expect(parseSearchQuery('before:2026-02-31').errors).toEqual(['before: expects YYYY-MM-DD.']);
  });
});

describe('searchDocuments', () => {
  it('matches title, body, checklist, and labels using normalized text', () => {
    const documents = [
      document({ title: 'Überblick', body: 'Mission notes' }),
      document({ checklist: 'Buy café beans' }),
      document({ labelNames: ['성경 공부'] }),
    ];
    expect(searchDocuments(documents, 'uberblick', DEFAULT_SEARCH_FILTERS)).toHaveLength(1);
    expect(searchDocuments(documents, 'cafe', DEFAULT_SEARCH_FILTERS)).toHaveLength(1);
    expect(searchDocuments(documents, '성경', DEFAULT_SEARCH_FILTERS)).toHaveLength(1);
  });

  it('intersects query operators with UI filters', () => {
    const activePinned = document({
      note: note({ type: 'checklist', color: 'yellow', pinnedAt: 200, updatedAt: 300 }),
      labelNames: ['Study'],
      labelIds: ['study-id'],
      hasImage: true,
    });
    const archived = document({
      note: note({ archivedAt: 250, color: 'yellow', updatedAt: 300 }),
      labelNames: ['Study'],
      labelIds: ['study-id'],
      hasImage: true,
    });

    const filters = {
      ...DEFAULT_SEARCH_FILTERS,
      type: 'checklist' as const,
      status: 'pinned' as const,
      colors: ['yellow' as const],
      labelIds: ['study-id'],
    };
    const results = searchDocuments([activePinned, archived], 'label:study has:image', filters);
    expect(results.map((result) => result.document.note.id)).toEqual([activePinned.note.id]);
  });

  it('excludes trash from every search', () => {
    const trashed = document({ note: note({ title: 'Needle', trashedAt: 500 }) });
    expect(searchDocuments([trashed], 'needle', DEFAULT_SEARCH_FILTERS)).toEqual([]);
  });
});
