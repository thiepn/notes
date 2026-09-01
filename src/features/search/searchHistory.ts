import { NOTE_COLORS, settingRecordSchema, type NotesDatabase } from '../../db';
import { DEFAULT_SEARCH_FILTERS, hasSearchFilters, type SearchFilters } from './searchTypes';

const SAVED_SEARCHES_KEY = 'search.saved.v1';
const RECENT_SEARCHES_KEY = 'notes.search.recent.v1';
const MAX_SAVED_SEARCHES = 20;
const MAX_RECENT_SEARCHES = 8;

export interface SearchSnapshot {
  query: string;
  filters: SearchFilters;
}

export interface SavedSearch extends SearchSnapshot {
  id: string;
  savedAt: number;
}

export interface RecentSearch extends SearchSnapshot {
  id: string;
  searchedAt: number;
}

export class SearchHistoryRepository {
  constructor(private readonly database: NotesDatabase) {}

  async listSaved(): Promise<SavedSearch[]> {
    const record = await this.database.settings.get(SAVED_SEARCHES_KEY);
    if (!record) return [];
    const parsedRecord = settingRecordSchema.parse(record);
    return parseSavedSearches(parsedRecord.value);
  }

  async save(snapshot: SearchSnapshot): Promise<SavedSearch[]> {
    const normalized = normalizeSnapshot(snapshot);
    if (!hasSearchSnapshot(normalized)) return this.listSaved();

    const existing = await this.listSaved();
    const signature = searchSignature(normalized);
    const duplicate = existing.find((item) => searchSignature(item) === signature);
    const savedAt = Date.now();
    const next: SavedSearch[] = duplicate
      ? [
          { ...duplicate, ...normalized, savedAt },
          ...existing.filter((item) => item.id !== duplicate.id),
        ]
      : [{ id: crypto.randomUUID(), ...normalized, savedAt }, ...existing];

    return this.writeSaved(next.slice(0, MAX_SAVED_SEARCHES));
  }

  async remove(id: string): Promise<SavedSearch[]> {
    const existing = await this.listSaved();
    return this.writeSaved(existing.filter((item) => item.id !== id));
  }

  private async writeSaved(searches: SavedSearch[]): Promise<SavedSearch[]> {
    const record = settingRecordSchema.parse({
      key: SAVED_SEARCHES_KEY,
      value: JSON.stringify({ version: 1, searches }),
      updatedAt: Date.now(),
    });
    await this.database.settings.put(record);
    return searches;
  }
}

export function readRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? parseRecentSearches(raw) : [];
  } catch {
    return [];
  }
}

export function rememberRecentSearch(snapshot: SearchSnapshot): RecentSearch[] {
  const normalized = normalizeSnapshot(snapshot);
  if (!hasSearchSnapshot(normalized)) return readRecentSearches();

  const existing = readRecentSearches();
  const signature = searchSignature(normalized);
  const duplicate = existing.find((item) => searchSignature(item) === signature);
  const searchedAt = Date.now();
  const next: RecentSearch[] = [
    {
      id: duplicate?.id ?? crypto.randomUUID(),
      ...normalized,
      searchedAt,
    },
    ...existing.filter((item) => searchSignature(item) !== signature),
  ].slice(0, MAX_RECENT_SEARCHES);

  try {
    window.localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify({ version: 1, searches: next }),
    );
  } catch {
    // Recent searches are best-effort device-local history.
  }
  return next;
}

export function clearRecentSearches(): RecentSearch[] {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Clearing device-local history is best effort.
  }
  return [];
}

export function searchSignature(snapshot: SearchSnapshot): string {
  const normalized = normalizeSnapshot(snapshot);
  return JSON.stringify({
    query: normalized.query,
    type: normalized.filters.type,
    status: normalized.filters.status,
    colors: [...normalized.filters.colors].sort(),
    labelIds: [...normalized.filters.labelIds].sort(),
    after: normalized.filters.after,
    before: normalized.filters.before,
  });
}

export function hasSearchSnapshot(snapshot: SearchSnapshot): boolean {
  return Boolean(snapshot.query.trim()) || hasSearchFilters(snapshot.filters);
}

export function summarizeSearch(snapshot: SearchSnapshot): {
  title: string;
  detail: string | null;
} {
  const normalized = normalizeSnapshot(snapshot);
  const title = normalized.query || 'Filtered search';
  const parts: string[] = [];
  if (normalized.filters.type !== 'any')
    parts.push(normalized.filters.type === 'text' ? 'Text' : 'Checklist');
  if (normalized.filters.status !== 'any') {
    parts.push(
      normalized.filters.status === 'active'
        ? 'Active'
        : normalized.filters.status === 'pinned'
          ? 'Pinned'
          : 'Archived',
    );
  }
  if (normalized.filters.colors.length > 0) {
    parts.push(
      `${normalized.filters.colors.length} ${normalized.filters.colors.length === 1 ? 'color' : 'colors'}`,
    );
  }
  if (normalized.filters.labelIds.length > 0) {
    parts.push(
      `${normalized.filters.labelIds.length} ${normalized.filters.labelIds.length === 1 ? 'label' : 'labels'}`,
    );
  }
  if (normalized.filters.after) parts.push(`after ${normalized.filters.after}`);
  if (normalized.filters.before) parts.push(`before ${normalized.filters.before}`);
  return { title, detail: parts.length > 0 ? parts.join(' · ') : null };
}

function normalizeSnapshot(snapshot: SearchSnapshot): SearchSnapshot {
  return {
    query: snapshot.query.trim(),
    filters: sanitizeFilters(snapshot.filters),
  };
}

function sanitizeFilters(value: unknown): SearchFilters {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SEARCH_FILTERS };
  const candidate = value as Partial<SearchFilters>;
  const colors = Array.isArray(candidate.colors)
    ? candidate.colors.filter((color): color is SearchFilters['colors'][number] =>
        NOTE_COLORS.includes(color as SearchFilters['colors'][number]),
      )
    : [];
  const labelIds = Array.isArray(candidate.labelIds)
    ? candidate.labelIds.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : [];
  return {
    type: candidate.type === 'text' || candidate.type === 'checklist' ? candidate.type : 'any',
    status:
      candidate.status === 'active' ||
      candidate.status === 'pinned' ||
      candidate.status === 'archived'
        ? candidate.status
        : 'any',
    colors: [...new Set(colors)],
    labelIds: [...new Set(labelIds)],
    after: typeof candidate.after === 'string' ? candidate.after : '',
    before: typeof candidate.before === 'string' ? candidate.before : '',
  };
}

function parseSavedSearches(raw: string): SavedSearch[] {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; searches?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.searches)) return [];
    return parsed.searches
      .map((item) => parseSavedSearch(item))
      .filter((item): item is SavedSearch => item !== null)
      .slice(0, MAX_SAVED_SEARCHES);
  } catch {
    return [];
  }
}

function parseRecentSearches(raw: string): RecentSearch[] {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; searches?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.searches)) return [];
    return parsed.searches
      .map((item) => parseRecentSearch(item))
      .filter((item): item is RecentSearch => item !== null)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function parseSavedSearch(value: unknown): SavedSearch | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<SavedSearch>;
  if (typeof item.id !== 'string' || !item.id || typeof item.savedAt !== 'number') return null;
  return {
    id: item.id,
    savedAt: item.savedAt,
    ...normalizeSnapshot({
      query: typeof item.query === 'string' ? item.query : '',
      filters: sanitizeFilters(item.filters),
    }),
  };
}

function parseRecentSearch(value: unknown): RecentSearch | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<RecentSearch>;
  if (typeof item.id !== 'string' || !item.id || typeof item.searchedAt !== 'number') return null;
  return {
    id: item.id,
    searchedAt: item.searchedAt,
    ...normalizeSnapshot({
      query: typeof item.query === 'string' ? item.query : '',
      filters: sanitizeFilters(item.filters),
    }),
  };
}
