import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  normalizeSearchText,
  parseSearchQuery,
  searchDocuments,
  tokenizeNormalizedSearchText,
  type SearchDocument,
} from './searchEngine';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

function note(id: string, title: string, options: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id,
    type: 'text',
    title,
    content: '',
    color: 'default',
    createdAt: 1,
    updatedAt: 1,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: 0,
    revision: 1,
    ...options,
  };
}

function document(record: NoteRecord, labelNames: string[] = []): SearchDocument {
  const normalizedTitle = normalizeSearchText(record.title);
  const normalizedBody = normalizeSearchText(record.content);
  const normalizedLabels = normalizeSearchText(labelNames.join(' '));
  const normalizedChecklist = '';
  const normalizedAttachments = '';
  const normalizedOcr = '';
  const normalizedAll = [normalizedTitle, normalizedBody, normalizedLabels]
    .filter(Boolean)
    .join(' ');
  return {
    note: record,
    checklistItems: [],
    labelIds: labelNames.map((_, index) => `label-${index}`),
    labelNames,
    attachmentNames: [],
    ocrText: '',
    hasImage: false,
    hasLink: false,
    hasReminder: false,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAttachments,
    normalizedOcr,
    normalizedAll,
    titleTokens: tokenizeNormalizedSearchText(normalizedTitle),
    bodyTokens: tokenizeNormalizedSearchText(normalizedBody),
    checklistTokens: [],
    labelTokens: tokenizeNormalizedSearchText(normalizedLabels),
    attachmentTokens: [],
    ocrTokens: [],
    allTokens: tokenizeNormalizedSearchText(normalizedAll),
  };
}

describe('organization search operators', () => {
  it('parses unlabeled and labeled constraints without turning them into free-text terms', () => {
    expect(parseSearchQuery('is:unlabeled')).toMatchObject({
      terms: [],
      requireUnlabeled: true,
      requireLabeled: false,
    });
    expect(parseSearchQuery('has:label')).toMatchObject({
      terms: [],
      requireUnlabeled: false,
      requireLabeled: true,
    });
  });

  it('supports the active unlabeled cleanup view without including archive', () => {
    const activeUnlabeled = document(note('active-unlabeled', 'Inbox note'));
    const activeLabeled = document(note('active-labeled', 'Organized note'), ['Project']);
    const archivedUnlabeled = document(
      note('archived-unlabeled', 'Archived loose note', { archivedAt: 10 }),
    );

    const results = searchDocuments(
      [activeUnlabeled, activeLabeled, archivedUnlabeled],
      'is:active is:unlabeled',
      DEFAULT_SEARCH_FILTERS,
    );

    expect(results.map((result) => result.document.note.id)).toEqual(['active-unlabeled']);
  });

  it('finds notes that already have at least one label', () => {
    const unlabeled = document(note('unlabeled', 'Loose note'));
    const labeled = document(note('labeled', 'Project note'), ['Project']);

    const results = searchDocuments([unlabeled, labeled], 'has:label', DEFAULT_SEARCH_FILTERS);
    expect(results.map((result) => result.document.note.id)).toEqual(['labeled']);
  });
});
