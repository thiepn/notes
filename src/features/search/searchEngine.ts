import type { ChecklistItemRecord, NoteRecord } from '../../db';
import type { SearchFilters, SearchStatusFilter, SearchTypeFilter } from './searchTypes';

export interface SearchDocument {
  note: NoteRecord;
  checklistItems: ChecklistItemRecord[];
  labelIds: string[];
  labelNames: string[];
  hasImage: boolean;
  hasLink: boolean;
  hasReminder: boolean;
  normalizedTitle: string;
  normalizedBody: string;
  normalizedChecklist: string;
  normalizedLabels: string;
  normalizedAll: string;
}

export interface ParsedSearchQuery {
  terms: string[];
  labelNames: string[];
  statuses: Exclude<SearchStatusFilter, 'any'>[];
  types: Exclude<SearchTypeFilter, 'any'>[];
  requireImage: boolean;
  requireLink: boolean;
  requireReminder: boolean;
  after: number | null;
  before: number | null;
  errors: string[];
}

export interface SearchResult {
  document: SearchDocument;
  score: number;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .replace(/ß/gu, 'ss')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = {
    terms: [],
    labelNames: [],
    statuses: [],
    types: [],
    requireImage: false,
    requireLink: false,
    requireReminder: false,
    after: null,
    before: null,
    errors: [],
  };

  for (const token of tokenizeSearchQuery(input)) {
    const separator = token.indexOf(':');
    if (separator <= 0) {
      const term = normalizeSearchText(token);
      if (term) parsed.terms.push(term);
      continue;
    }

    const operator = token.slice(0, separator).toLocaleLowerCase();
    const rawValue = token.slice(separator + 1).trim();
    const value = normalizeSearchText(rawValue);

    if (operator === 'label' && value) {
      parsed.labelNames.push(value);
      continue;
    }

    if (operator === 'is') {
      if (value === 'pinned' || value === 'active' || value === 'archived') {
        parsed.statuses.push(value);
        continue;
      }
      if (value === 'text' || value === 'checklist') {
        parsed.types.push(value);
        continue;
      }
    }

    if (operator === 'has' && value === 'image') {
      parsed.requireImage = true;
      continue;
    }
    if (operator === 'has' && value === 'link') {
      parsed.requireLink = true;
      continue;
    }
    if (operator === 'has' && value === 'reminder') {
      parsed.requireReminder = true;
      continue;
    }

    if (operator === 'before' || operator === 'after') {
      const timestamp = parseLocalDate(rawValue);
      if (timestamp === null) {
        parsed.errors.push(`${operator}: expects YYYY-MM-DD.`);
      } else if (operator === 'before') {
        parsed.before = parsed.before === null ? timestamp : Math.min(parsed.before, timestamp);
      } else {
        parsed.after = parsed.after === null ? timestamp : Math.max(parsed.after, timestamp);
      }
      continue;
    }

    const fallback = normalizeSearchText(token);
    if (fallback) parsed.terms.push(fallback);
  }

  return parsed;
}

export function searchDocuments(
  documents: SearchDocument[],
  query: string,
  filters: SearchFilters,
): SearchResult[] {
  const parsed = parseSearchQuery(query);
  const after = maxNullable(parsed.after, parseLocalDate(filters.after));
  const before = minNullable(parsed.before, parseLocalDate(filters.before));
  const selectedColors = new Set(filters.colors);
  const selectedLabelIds = new Set(filters.labelIds);

  const results: SearchResult[] = [];
  for (const document of documents) {
    const { note } = document;
    if (note.trashedAt !== null) continue;
    if (!matchesStatus(note, filters.status)) continue;
    if (!parsed.statuses.every((status) => matchesStatus(note, status))) continue;
    if (!matchesType(note, filters.type)) continue;
    if (!parsed.types.every((type) => note.type === type)) continue;
    if (selectedColors.size > 0 && !selectedColors.has(note.color)) continue;
    if ([...selectedLabelIds].some((labelId) => !document.labelIds.includes(labelId))) continue;
    if (
      parsed.labelNames.some(
        (name) => !document.labelNames.some((label) => normalizeSearchText(label) === name),
      )
    ) {
      continue;
    }
    if (parsed.requireImage && !document.hasImage) continue;
    if (parsed.requireLink && !document.hasLink) continue;
    if (parsed.requireReminder && !document.hasReminder) continue;
    if (after !== null && note.updatedAt < after) continue;
    if (before !== null && note.updatedAt >= before) continue;
    if (parsed.terms.some((term) => !document.normalizedAll.includes(term))) continue;

    results.push({ document, score: scoreDocument(document, parsed.terms) });
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aPinned = a.document.note.pinnedAt !== null;
    const bPinned = b.document.note.pinnedAt !== null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return b.document.note.updatedAt - a.document.note.updatedAt;
  });
}

function scoreDocument(document: SearchDocument, terms: string[]): number {
  if (terms.length === 0) return 0;
  let score = 0;
  for (const term of terms) {
    if (document.normalizedTitle.includes(term)) score += 8;
    if (document.normalizedLabels.includes(term)) score += 5;
    if (document.normalizedChecklist.includes(term)) score += 3;
    if (document.normalizedBody.includes(term)) score += 2;
  }
  return score;
}

function matchesStatus(note: NoteRecord, status: SearchStatusFilter): boolean {
  if (status === 'any') return note.trashedAt === null;
  if (status === 'active') return note.archivedAt === null && note.trashedAt === null;
  if (status === 'pinned') {
    return note.pinnedAt !== null && note.archivedAt === null && note.trashedAt === null;
  }
  return note.archivedAt !== null && note.trashedAt === null;
}

function matchesType(note: NoteRecord, type: SearchTypeFilter): boolean {
  return type === 'any' || note.type === type;
}

function tokenizeSearchQuery(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;

  for (const character of input) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (/\s/u.test(character) && !quoted) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  if (current) tokens.push(current);
  return tokens;
}

function parseLocalDate(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.getTime();
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
