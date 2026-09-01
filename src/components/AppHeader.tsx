import { useEffect, useRef, useState } from 'react';
import {
  Command,
  LayoutGrid,
  List,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  StickyNote,
  Sun,
  X,
} from 'lucide-react';

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
  onCommandPalette(): void;
  searchQuery: string;
  filtersOpen: boolean;
  filtersActive: boolean;
  onSearchQueryChange(query: string): void;
  onToggleFilters(): void;
  onClearSearch(): void;
}

export function AppHeader({
  onMenu,
  onCommandPalette,
  searchQuery,
  filtersOpen,
  filtersActive,
  onSearchQueryChange,
  onToggleFilters,
  onClearSearch,
}: AppHeaderProps) {
  const { preference, cyclePreference } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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
      if (document.querySelector('[role="dialog"], .note-composer')) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const clickViewButton = (label: 'Grid view' | 'List view') => {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
    setMoreOpen(false);
  };

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

      <div className="header-actions" ref={menuRef}>
        <IconButton
          label="More options"
          tooltip="More options"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          data-testid="header-more-toggle"
        >
          <MoreHorizontal />
        </IconButton>
        {moreOpen ? (
          <div className="header-more-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                onCommandPalette();
              }}
            >
              <Command aria-hidden="true" />
              <span>Command palette</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => clickViewButton('Grid view')}>
              <LayoutGrid aria-hidden="true" />
              <span>Grid view</span>
            </button>
            <button type="button" role="menuitem" onClick={() => clickViewButton('List view')}>
              <List aria-hidden="true" />
              <span>List view</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                cyclePreference();
                setMoreOpen(false);
              }}
            >
              <ThemeIcon aria-hidden="true" />
              <span>{THEME_LABELS[preference]} appearance</span>
              <small>Next: {THEME_LABELS[nextPreference]}</small>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
