import { Bookmark, Clock3, X } from 'lucide-react';

import {
  summarizeSearch,
  type RecentSearch,
  type SavedSearch,
  type SearchSnapshot,
} from './searchHistory';

interface SearchHistoryPopoverProps {
  saved: SavedSearch[];
  recent: RecentSearch[];
  onApply(snapshot: SearchSnapshot): void;
  onRemoveSaved(id: string): void;
  onClearRecent(): void;
}

export function SearchHistoryPopover({
  saved,
  recent,
  onApply,
  onRemoveSaved,
  onClearRecent,
}: SearchHistoryPopoverProps) {
  if (saved.length === 0 && recent.length === 0) return null;

  return (
    <div className="search-history-popover" role="dialog" aria-label="Search history">
      {saved.length > 0 ? (
        <section className="search-history-section" aria-labelledby="saved-searches-title">
          <div className="search-history-heading">
            <span id="saved-searches-title">
              <Bookmark aria-hidden="true" /> Saved searches
            </span>
          </div>
          <div className="search-history-list">
            {saved.map((search) => (
              <SearchHistoryRow
                key={search.id}
                search={search}
                kind="saved"
                onApply={() => onApply(search)}
                onRemove={() => onRemoveSaved(search.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
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
            {recent.map((search) => (
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
  onApply,
  onRemove,
}: {
  search: SearchSnapshot;
  kind: 'saved' | 'recent';
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
