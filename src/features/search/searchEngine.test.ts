import { describe, expect, it } from 'vitest';

import type { NoteRecord } from '../../db';
import {
  extractIndexedOcrText,
  normalizeSearchText,
  parseSearchQuery,
  searchDocuments,
  tokenizeNormalizedSearchText,
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
    attachmentNames?: string[];
    hasImage?: boolean;
    hasLink?: boolean;
    hasReminder?: boolean;
  } = {},
): SearchDocument {
  const record = input.note ?? note({ title: input.title ?? '', content: input.body ?? '' });
  const attachmentNames = input.attachmentNames ?? [];
  const ocrText = extractIndexedOcrText(record.content);
  const normalizedTitle = normalizeSearchText(record.title);
  const normalizedBody = normalizeSearchText(record.content);
  const normalizedChecklist = normalizeSearchText(input.checklist ?? '');
  const normalizedLabels = normalizeSearchText((input.labelNames ?? []).join(' '));
  const normalizedAttachments = normalizeSearchText(attachmentNames.join(' '));
  const normalizedOcr = normalizeSearchText(ocrText);
  const titleTokens = tokenizeNormalizedSearchText(normalizedTitle);
  const bodyTokens = tokenizeNormalizedSearchText(normalizedBody);
  const checklistTokens = tokenizeNormalizedSearchText(normalizedChecklist);
  const labelTokens = tokenizeNormalizedSearchText(normalizedLabels);
  const attachmentTokens = tokenizeNormalizedSearchText(normalizedAttachments);
  const ocrTokens = tokenizeNormalizedSearchText(normalizedOcr);
  const normalizedAll = [
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAttachments,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    note: record,
    checklistItems: [],
    labelIds: input.labelIds ?? [],
    labelNames: input.labelNames ?? [],
    attachmentNames,
    ocrText,
    hasImage: input.hasImage ?? false,
    hasLink: input.hasLink ?? false,
    hasReminder: input.hasReminder ?? false,
    normalizedTitle,
    normalizedBody,
    normalizedChecklist,
    normalizedLabels,
    normalizedAttachments,
    normalizedOcr,
    normalizedAll,
    titleTokens,
    bodyTokens,
    checklistTokens,
    labelTokens,
    attachmentTokens,
    ocrTokens,
    allTokens: [
      ...new Set([
        ...titleTokens,
        ...bodyTokens,
        ...checklistTokens,
        ...labelTokens,
        ...attachmentTokens,
      ]),
    ],
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

describe('OCR indexing', () => {
  it('extracts V2-6 OCR sections without indexing later peer headings as OCR', () => {
    expect(
      extractIndexedOcrText(
        'Intro\n\n## Extracted text\n\nReceipt 4821\nSecond line\n\n## Notes\n\nManual note',
      ),
    ).toBe('Receipt 4821\nSecond line');
  });
});

describe('parseSearchQuery', () => {
  it('parses operators and quoted label values', () => {
    const parsed = parseSearchQuery(
      'mission label:"Bible Study" is:pinned is:checklist has:image has:link has:reminder before:2026-09-01 after:2026-08-01',
    );
    expect(parsed.terms).toEqual(['mission']);
    expect(parsed.labelNames).toEqual(['bible study']);
    expect(parsed.statuses).toEqual(['pinned']);
    expect(parsed.types).toEqual(['checklist']);
    expect(parsed.requireImage).toBe(true);
    expect(parsed.requireLink).toBe(true);
    expect(parsed.requireReminder).toBe(true);
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

  it('tolerates bounded spelling mistakes without making short terms fuzzy', () => {
    const missionary = document({ title: 'Missionary preparation' });
    const unrelated = document({ title: 'Weekly groceries' });
    expect(
      searchDocuments([missionary, unrelated], 'misionary', DEFAULT_SEARCH_FILTERS).map(
        (result) => result.document.note.id,
      ),
    ).toEqual([missionary.note.id]);
    expect(searchDocuments([missionary], 'mis', DEFAULT_SEARCH_FILTERS)).toHaveLength(1);
    expect(searchDocuments([missionary], 'mss', DEFAULT_SEARCH_FILTERS)).toEqual([]);
  });

  it('ranks title matches above lower-value body matches', () => {
    const titleMatch = document({ title: 'Missionary planning', body: 'General notes' });
    const bodyMatch = document({ title: 'General notes', body: 'Missionary planning' });
    const results = searchDocuments([bodyMatch, titleMatch], 'missionary', DEFAULT_SEARCH_FILTERS);
    expect(results.map((result) => result.document.note.id)).toEqual([
      titleMatch.note.id,
      bodyMatch.note.id,
    ]);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('searches attachment filenames and committed OCR text', () => {
    const attachment = document({ attachmentNames: ['annual-budget-2026.pdf'] });
    const ocr = document({
      note: note({ content: 'Photo\n\n## Extracted text\n\nKingdom receipt 4821' }),
    });
    expect(searchDocuments([attachment, ocr], 'annual budget', DEFAULT_SEARCH_FILTERS)).toEqual([
      expect.objectContaining({ document: attachment }),
    ]);
    expect(searchDocuments([attachment, ocr], 'receipt 4821', DEFAULT_SEARCH_FILTERS)).toEqual([
      expect.objectContaining({ document: ocr }),
    ]);
  });

  it('intersects query operators with UI filters', () => {
    const activePinned = document({
      note: note({ type: 'checklist', color: 'yellow', pinnedAt: 200, updatedAt: 300 }),
      labelNames: ['Study'],
      labelIds: ['study-id'],
      hasImage: true,
      hasReminder: true,
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
    const results = searchDocuments(
      [activePinned, archived],
      'label:study has:image has:reminder',
      filters,
    );
    expect(results.map((result) => result.document.note.id)).toEqual([activePinned.note.id]);
  });

  it('matches only active reminder documents with has:reminder', () => {
    const reminded = document({ title: 'Call mom', hasReminder: true });
    const normal = document({ title: 'Buy milk' });
    expect(searchDocuments([reminded, normal], 'has:reminder', DEFAULT_SEARCH_FILTERS)).toEqual([
      expect.objectContaining({ document: reminded }),
    ]);
  });

  it('excludes trash from every search', () => {
    const trashed = document({ note: note({ title: 'Needle', trashedAt: 500 }) });
    expect(searchDocuments([trashed], 'needle', DEFAULT_SEARCH_FILTERS)).toEqual([]);
  });
});
