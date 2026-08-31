import type { NoteColor, NoteType } from '../../db';

export type SearchStatusFilter = 'any' | 'active' | 'pinned' | 'archived';
export type SearchTypeFilter = 'any' | NoteType;

export interface SearchFilters {
  type: SearchTypeFilter;
  status: SearchStatusFilter;
  colors: NoteColor[];
  labelIds: string[];
  after: string;
  before: string;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  type: 'any',
  status: 'any',
  colors: [],
  labelIds: [],
  after: '',
  before: '',
};

export function hasSearchFilters(filters: SearchFilters): boolean {
  return (
    filters.type !== 'any' ||
    filters.status !== 'any' ||
    filters.colors.length > 0 ||
    filters.labelIds.length > 0 ||
    Boolean(filters.after) ||
    Boolean(filters.before)
  );
}
