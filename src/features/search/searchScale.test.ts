import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  normalizeSearchText,
  searchDocuments,
  tokenizeNormalizedSearchText,
  type SearchDocument,
} from './searchEngine';
import { DEFAULT_SEARCH_FILTERS } from './searchTypes';

function document(index: number): SearchDocument {
  const title = index === 9_999 ? 'Missionary preparation needle' : `Library note ${index}`;
  const body = `Reference material ${index} weekly planning ordinary text`;
  const normalizedTitle = normalizeSearchText(title);
  const normalizedBody = normalizeSearchText(body);
  const titleTokens = tokenizeNormalizedSearchText(normalizedTitle);
  const bodyTokens = tokenizeNormalizedSearchText(normalizedBody);
  const note: NoteRecord = {
    id: `scale-note-${index}`,
    type: 'text',
    title,
    content: body,
    color: 'default',
    createdAt: index,
    updatedAt: index,
    pinnedAt: null,
    archivedAt: null,
    trashedAt: null,
    position: index,
    revision: 1,
  };
  return {
    note,
    checklistItems: [],
    labelIds: [],
    labelNames: [],
    attachmentNames: [],
    ocrText: '',
    hasImage: false,
    hasLink: false,
    hasReminder: false,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist: '',
    normalizedLabels: '',
    normalizedAttachments: '',
    normalizedOcr: '',
    normalizedAll: `${normalizedTitle} ${normalizedBody}`,
    titleTokens,
    bodyTokens,
    checklistTokens: [],
    labelTokens: [],
    attachmentTokens: [],
    ocrTokens: [],
    allTokens: [...new Set([...titleTokens, ...bodyTokens])],
  };
}

describe('large-library search budget', () => {
  it('keeps a 10,000-note fuzzy search within the interactive budget', () => {
    const documents = Array.from({ length: 10_000 }, (_, index) => document(index));
    const started = performance.now();
    const results = searchDocuments(documents, 'misionary', DEFAULT_SEARCH_FILTERS);
    const elapsed = performance.now() - started;
    expect(results.map((result) => result.document.note.id)).toEqual(['scale-note-9999']);
    expect(elapsed).toBeLessThan(1_500);
  });
});
