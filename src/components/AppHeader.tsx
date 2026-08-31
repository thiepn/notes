import { useEffect, useRef } from 'react';
import { Menu, Monitor, Moon, Search, SlidersHorizontal, StickyNote, Sun, X } from 'lucide-react';

import { IconButton } from './ui/IconButton';
import { useTheme } from '../theme/ThemeContext';
import { nextThemePreference, type ThemePreference } from '../theme/theme';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

interface AppHeaderProps {
  onMenu(): void;
  searchQuery: string;
  filtersOpen: boolean;
  filtersActive: boolean;
  onSearchQueryChange(query: string): void;
  onToggleFilters(): void;
  onClearSearch(): void;
}

export function AppHeader({
  onMenu,
  searchQuery,
  filtersOpen,
  filtersActive,
  onSearchQueryChange,
  onToggleFilters,
  onClearSearch,
}: AppHeaderProps) {
  const { preference, cyclePreference } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nextPreference = nextThemePreference(preference);
  const ThemeIcon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="app-header">
      <div className="header-leading">
        <IconButton
          label="Toggle navigation"
          tooltip="Toggle navigation"
          onClick={onMenu}
          aria-controls="app-navigation"
          data-testid="navigation-toggle"
        >
          <Menu />
        </IconButton>

        <div className="app-brand" aria-label="Notes">
          <span className="app-brand-mark" aria-hidden="true">
            <StickyNote />
          </span>
          <span className="app-brand-text">Notes</span>
        </div>
      </div>

      <div className="search-shell" role="search">
        <Search aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search notes"
          aria-label="Search notes"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && searchQuery) {
              event.preventDefault();
              onSearchQueryChange('');
            }
          }}
        />
        {searchQuery ? (
          <button
            className="search-inline-action"
            type="button"
            aria-label="Clear search query"
            onClick={() => onSearchQueryChange('')}
          >
            <X />
          </button>
        ) : null}
        <button
          className="search-inline-action"
          type="button"
          aria-label="Search filters"
          aria-expanded={filtersOpen}
          aria-pressed={filtersOpen || filtersActive}
          data-active={filtersOpen || filtersActive}
          onClick={onToggleFilters}
        >
          <SlidersHorizontal />
        </button>
        {searchQuery || filtersActive ? (
          <button className="search-reset" type="button" onClick={onClearSearch}>
            Reset
          </button>
        ) : null}
      </div>

      <div className="header-actions">
        <IconButton
          label={`Appearance: ${THEME_LABELS[preference]}`}
          tooltip={`${THEME_LABELS[preference]} appearance · switch to ${THEME_LABELS[nextPreference]}`}
          onClick={cyclePreference}
          data-testid="theme-toggle"
        >
          <ThemeIcon />
        </IconButton>
      </div>
    </header>
  );
}
