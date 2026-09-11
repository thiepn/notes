import type { LabelRecord } from '../../db';
import { normalizeSearchText } from './searchEngine';
import {
  searchSignature,
  summarizeSearch,
  type RecentSearch,
  type SavedSearch,
  type SearchSnapshot,
} from './searchHistory';

export interface SearchQuerySuggestion {
  id: string;
  label: string;
  description: string;
  query: string;
}

export interface FilteredSearchHistory {
  saved: SavedSearch[];
  recent: RecentSearch[];
}

const IS_OPTIONS: Array<[string, string]> = [
  ['is:pinned', 'Pinned notes'],
  ['is:active', 'Active notes'],
  ['is:archived', 'Archived notes'],
  ['is:text', 'Text notes'],
  ['is:checklist', 'Checklist notes'],
];

const HAS_OPTIONS: Array<[string, string]> = [
  ['has:reminder', 'Notes with reminders'],
  ['has:image', 'Notes with images'],
  ['has:link', 'Notes with links'],
];

export function buildSearchQuerySuggestions(
  query: string,
  labels: LabelRecord[],
  limit = 6,
): SearchQuerySuggestion[] {
  if (limit <= 0) return [];
  const trimmed = query.trimStart();
  const token = currentQueryToken(trimmed);
  const normalizedToken = normalizeSearchText(token.replace(':', ' '));

  if (!trimmed) {
    return [
      suggestion('quick:pinned', 'Pinned notes', 'Use is:pinned', 'is:pinned'),
      suggestion('quick:reminders', 'With reminders', 'Use has:reminder', 'has:reminder'),
      suggestion('quick:images', 'With images', 'Use has:image', 'has:image'),
      suggestion('quick:checklists', 'Checklists', 'Use is:checklist', 'is:checklist'),
    ].slice(0, limit);
  }

  if (token.toLocaleLowerCase().startsWith('is:') || normalizedToken === 'is') {
    const value = token.includes(':') ? token.slice(token.indexOf(':') + 1) : '';
    return operatorSuggestions(trimmed, token, IS_OPTIONS, value, 'is').slice(0, limit);
  }

  if (token.toLocaleLowerCase().startsWith('has:') || normalizedToken === 'has') {
    const value = token.includes(':') ? token.slice(token.indexOf(':') + 1) : '';
    return operatorSuggestions(trimmed, token, HAS_OPTIONS, value, 'has').slice(0, limit);
  }

  if (token.toLocaleLowerCase().startsWith('label:') || normalizedToken === 'label') {
    const value = token.includes(':') ? token.slice(token.indexOf(':') + 1) : '';
    const normalizedValue = normalizeSearchText(value);
    return labels
      .filter((label) => {
        const name = normalizeSearchText(label.name);
        return !normalizedValue || name.startsWith(normalizedValue) || name.includes(normalizedValue);
      })
      .slice(0, limit)
      .map((label) => {
        const labelQuery = `label:${quoteQueryValue(label.name)}`;
        return suggestion(
          `label:${label.id}`,
          `Label: ${label.name}`,
          labelQuery,
          replaceCurrentToken(trimmed, token, labelQuery),
        );
      });
  }

  return [];
}

export function filterSearchHistory(
  saved: SavedSearch[],
  recent: RecentSearch[],
  query: string,
  limitPerSection = 5,
): FilteredSearchHistory {
  if (limitPerSection <= 0) return { saved: [], recent: [] };
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  const matchingSaved = rankSnapshots(saved, terms).slice(0, limitPerSection);
  const savedSignatures = new Set(saved.map(searchSignature));
  const matchingRecent = rankSnapshots(
    recent.filter((search) => !savedSignatures.has(searchSignature(search))),
    terms,
  ).slice(0, limitPerSection);
  return { saved: matchingSaved, recent: matchingRecent };
}

function rankSnapshots<T extends SearchSnapshot>(items: T[], terms: string[]): T[] {
  if (terms.length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreSnapshot(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

function scoreSnapshot(snapshot: SearchSnapshot, terms: string[]): number {
  const summary = summarizeSearch(snapshot);
  const title = normalizeSearchText(summary.title);
  const detail = normalizeSearchText(summary.detail ?? '');
  const haystack = `${title} ${detail}`.trim();
  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) return 0;
    if (title === term) score += 240;
    else if (title.startsWith(term)) score += 180;
    else if (title.includes(term)) score += 140;
    else score += 80;
  }
  return score;
}

function operatorSuggestions(
  query: string,
  token: string,
  options: Array<[string, string]>,
  value: string,
  prefix: string,
): SearchQuerySuggestion[] {
  const normalizedValue = normalizeSearchText(value);
  return options
    .filter(([operator]) => {
      const operatorValue = operator.slice(operator.indexOf(':') + 1);
      return !normalizedValue || normalizeSearchText(operatorValue).includes(normalizedValue);
    })
    .map(([operator, label]) =>
      suggestion(
        `${prefix}:${operator}`,
        label,
        operator,
        replaceCurrentToken(query, token, operator),
      ),
    );
}

function currentQueryToken(query: string): string {
  const match = /(?:^|\s)([^\s]*)$/u.exec(query);
  return match?.[1] ?? '';
}

function replaceCurrentToken(query: string, token: string, replacement: string): string {
  if (!token) return replacement;
  return `${query.slice(0, Math.max(0, query.length - token.length))}${replacement}`.trimStart();
}

function quoteQueryValue(value: string): string {
  const sanitized = value.replace(/"/gu, '').trim();
  return /\s/u.test(sanitized) ? `"${sanitized}"` : sanitized;
}

function suggestion(
  id: string,
  label: string,
  description: string,
  query: string,
): SearchQuerySuggestion {
  return { id, label, description, query };
}
