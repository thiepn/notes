import { RotateCcw, X } from 'lucide-react';

import { NOTE_COLORS, type LabelRecord, type NoteColor } from '../../db';
import { DEFAULT_SEARCH_FILTERS, type SearchFilters } from './searchTypes';

const COLOR_LABELS: Record<NoteColor, string> = {
  default: 'Default',
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  gray: 'Gray',
};

interface SearchFiltersPanelProps {
  filters: SearchFilters;
  labels: LabelRecord[];
  onChange(filters: SearchFilters): void;
  onClose(): void;
}

export function SearchFiltersPanel({
  filters,
  labels,
  onChange,
  onClose,
}: SearchFiltersPanelProps) {
  const toggleColor = (color: NoteColor) => {
    const colors = filters.colors.includes(color)
      ? filters.colors.filter((item) => item !== color)
      : [...filters.colors, color];
    onChange({ ...filters, colors });
  };

  const toggleLabel = (labelId: string) => {
    const labelIds = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((id) => id !== labelId)
      : [...filters.labelIds, labelId];
    onChange({ ...filters, labelIds });
  };

  return (
    <section className="search-filters" aria-label="Search filters">
      <header className="search-filters-header">
        <div>
          <strong>Filters</strong>
          <span>Refine local results</span>
        </div>
        <button
          className="search-filters-close"
          type="button"
          aria-label="Close search filters"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="search-filter-row search-filter-selects">
        <label>
          <span>Type</span>
          <select
            value={filters.type}
            onChange={(event) =>
              onChange({ ...filters, type: event.target.value as SearchFilters['type'] })
            }
          >
            <option value="any">Any type</option>
            <option value="text">Text</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>

        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) =>
              onChange({ ...filters, status: event.target.value as SearchFilters['status'] })
            }
          >
            <option value="any">Active + archived</option>
            <option value="active">Active</option>
            <option value="pinned">Pinned</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <label>
          <span>After updated date</span>
          <input
            type="date"
            value={filters.after}
            onChange={(event) => onChange({ ...filters, after: event.target.value })}
          />
        </label>

        <label>
          <span>Before updated date</span>
          <input
            type="date"
            value={filters.before}
            onChange={(event) => onChange({ ...filters, before: event.target.value })}
          />
        </label>
      </div>

      <div className="search-filter-row">
        <span className="search-filter-label">Colors</span>
        <div className="search-color-filters" role="group" aria-label="Filter by color">
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              className="search-color-filter"
              data-color={color}
              data-selected={filters.colors.includes(color)}
              type="button"
              aria-label={`Filter ${COLOR_LABELS[color]} notes`}
              aria-pressed={filters.colors.includes(color)}
              onClick={() => toggleColor(color)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="search-filter-row">
        <span className="search-filter-label">Labels</span>
        {labels.length > 0 ? (
          <div className="search-label-filters">
            {labels.map((label) => (
              <label key={label.id}>
                <input
                  type="checkbox"
                  checked={filters.labelIds.includes(label.id)}
                  onChange={() => toggleLabel(label.id)}
                />
                <span>{label.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <span className="search-filter-empty">No labels yet</span>
        )}
      </div>

      <button
        className="search-clear-filters"
        type="button"
        onClick={() => onChange({ ...DEFAULT_SEARCH_FILTERS })}
      >
        <RotateCcw aria-hidden="true" />
        Clear filters
      </button>
    </section>
  );
}
