import { Bookmark, Clock3, Search, X } from 'lucide-react';

import type { LabelRecord } from '../../db';
import {
  summarizeSearch,
  type RecentSearch,
  type SavedSearch,
  type SearchSnapshot,
} from './searchHistory';
import { buildSearchQuerySuggestions, filterSearchHistory } from './searchSuggestions';

interface SearchHistoryPopoverProps {
  query: string;
  labels: LabelRecord[];
  saved: SavedSearch[];
  recent: RecentSearch[];
  onApply(snapshot: SearchSnapshot): void;
  onApplyQuery(query: string): void;
  onRemoveSaved(id: string): void;
  onClearRecent(): void;
}

export function SearchHistoryPopover({
  query,
  labels,
  saved,
  recent,
  onApply,
  onApplyQuery,
  onRemoveSaved,
  onClearRecent,
}: SearchHistoryPopoverProps) {
  const suggestions = buildSearchQuerySuggestions(query, labels);
  const filteredHistory = filterSearchHistory(saved, recent, query);
  if (
    suggestions.length === 0 &&
    filteredHistory.saved.length === 0 &&
    filteredHistory.recent.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="search-history-popover search-assist-popover"
      id="search-assist-popover"
      role="dialog"
      aria-label="Search history"
    >
      {suggestions.length > 0 ? (
        <section className="search-history-section" aria-labelledby="search-suggestions-title">
          <div className="search-history-heading">
            <span id="search-suggestions-title">
              <Search aria-hidden="true" /> Search shortcuts
            </span>
          </div>
          <div className="search-history-list search-suggestion-list">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                className="search-suggestion-apply"
                type="button"
                data-search-nav="true"
                aria-label={`Use search suggestion: ${suggestion.label}`}
                onClick={() => onApplyQuery(suggestion.query)}
              >
                <strong>{suggestion.label}</strong>
                <span>{suggestion.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {filteredHistory.saved.length > 0 ? (
        <section className="search-history-section" aria-labelledby="saved-searches-title">
          <div className="search-history-heading">
            <span id="saved-searches-title">
              <Bookmark aria-hidden="true" /> Saved searches
            </span>
          </div>
          <div className="search-history-list">
            {filteredHistory.saved.map((search) => (
              <SearchHistoryRow
                key={search.id}
                search={search}
                kind="saved"
                savedSearchId={search.id}
                onApply={() => onApply(search)}
                onRemove={() => onRemoveSaved(search.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {filteredHistory.recent.length > 0 ? (
        <section className="search-history-section" aria-labelledby="recent-searches-title">
          <div className="search-history-heading">
            <span id="recent-searches-title">
              <Clock3 aria-hidden="true" /> Recent searches
            </span>
            <button type="button" onClick={onClearRecent}>
              Clear
            </button>
          </div>
          <div className="search-history-list">
            {filteredHistory.recent.map((search) => (
              <SearchHistoryRow
                key={search.id}
                search={search}
                kind="recent"
                onApply={() => onApply(search)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SearchHistoryRow({
  search,
  kind,
  savedSearchId,
  onApply,
  onRemove,
}: {
  search: SearchSnapshot;
  kind: 'saved' | 'recent';
  savedSearchId?: string;
  onApply(): void;
  onRemove?: (() => void) | undefined;
}) {
  const summary = summarizeSearch(search);
  return (
    <div className="search-history-row">
      <button
        className="search-history-apply"
        type="button"
        aria-label={`Open ${kind} search: ${summary.title}`}
        data-saved-search-id={savedSearchId}
        data-search-nav="true"
        onClick={onApply}
      >
        <strong>{summary.title}</strong>
        {summary.detail ? <span>{summary.detail}</span> : null}
      </button>
      {onRemove ? (
        <button
          className="search-history-remove"
          type="button"
          aria-label={`Remove saved search: ${summary.title}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
