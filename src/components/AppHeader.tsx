import { useEffect, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  Command,
  LayoutGrid,
  List,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  SlidersHorizontal,
  StickyNote,
  X,
} from 'lucide-react';

import { notesDatabase } from '../db';
import { usePrivacy } from '../features/privacy/PrivacyContext';
import { SearchHistoryPopover } from '../features/search/SearchHistoryPopover';
import {
  clearRecentSearches,
  readRecentSearches,
  rememberRecentSearch,
  searchSignature,
  SearchHistoryRepository,
  type RecentSearch,
  type SavedSearch,
  type SearchSnapshot,
} from '../features/search/searchHistory';
import { hasSearchFilters, type SearchFilters } from '../features/search/searchTypes';
import { IconButton } from './ui/IconButton';

const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);

interface AppHeaderProps {
  onMenu(): void;
  onCommandPalette(): void;
  onSettings(): void;
  onViewModeChange(view: 'grid' | 'list'): void;
  searchFocusRequest: number;
  searchQuery: string;
  searchFilters: SearchFilters;
  filtersOpen: boolean;
  filtersActive: boolean;
  onSearchQueryChange(query: string): void;
  onToggleFilters(): void;
  onClearSearch(): void;
  onApplySearch(snapshot: SearchSnapshot): void;
}

export function AppHeader({
  onMenu,
  onCommandPalette,
  onSettings,
  onViewModeChange,
  searchFocusRequest,
  searchQuery,
  searchFilters,
  filtersOpen,
  filtersActive,
  onSearchQueryChange,
  onToggleFilters,
  onClearSearch,
  onApplySearch,
}: AppHeaderProps) {
  const { lockEnabled, lock } = usePrivacy();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const initialMoreFocusRef = useRef<'first' | 'last'>('first');
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(readRecentSearches);
  const currentSnapshot: SearchSnapshot = { query: searchQuery, filters: searchFilters };
  const currentSignature = searchSignature(currentSnapshot);
  const currentCanBeSaved = Boolean(searchQuery.trim()) || filtersActive;
  const currentIsSaved = savedSearches.some(
    (search) => searchSignature(search) === currentSignature,
  );
  const historyVisible = searchHistoryOpen && !searchQuery.trim() && !filtersActive && !filtersOpen;
  const activeFilterCount =
    (searchFilters.type !== 'any' ? 1 : 0) +
    (searchFilters.status !== 'any' ? 1 : 0) +
    searchFilters.colors.length +
    searchFilters.labelIds.length +
    (searchFilters.after ? 1 : 0) +
    (searchFilters.before ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    const reloadSaved = () => {
      void searchHistoryRepository.listSaved().then((searches) => {
        if (!cancelled) setSavedSearches(searches);
      });
    };
    reloadSaved();
    window.addEventListener('notes-search-history-changed', reloadSaved);
    return () => {
      cancelled = true;
      window.removeEventListener('notes-search-history-changed', reloadSaved);
    };
  }, []);

  useEffect(() => {
    const hasQuery = searchQuery.trim().length >= 2;
    if (!hasQuery && !hasSearchFilters(searchFilters)) return;
    const timer = window.setTimeout(() => {
      setRecentSearches(rememberRecentSearch({ query: searchQuery, filters: searchFilters }));
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [searchFilters, searchQuery]);

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

    const focusFrame = window.requestAnimationFrame(() => {
      const items = menuItems(moreMenuRef.current);
      const target = initialMoreFocusRef.current === 'last' ? items.at(-1) : items[0];
      target?.focus({ preventScroll: true });
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target)) return;
      setMoreOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const menu = moreMenuRef.current;
      if (!menu) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMoreOpen(false);
        window.requestAnimationFrame(() => moreButtonRef.current?.focus({ preventScroll: true }));
        return;
      }

      if (!menu.contains(document.activeElement)) return;
      const items = menuItems(menu);
      if (items.length === 0) return;
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      let nextIndex: number | null = null;

      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      items[nextIndex]?.focus({ preventScroll: true });
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (searchFocusRequest <= 0) return;
    searchInputRef.current?.focus();
  }, [searchFocusRequest]);

  const openMoreMenu = (initialFocus: 'first' | 'last' = 'first') => {
    initialMoreFocusRef.current = initialFocus;
    setMoreOpen(true);
  };

  const chooseView = (view: 'grid' | 'list') => {
    onViewModeChange(view);
    setMoreOpen(false);
  };

  const removeSavedSearch = async (id: string) => {
    setSavedSearches(await searchHistoryRepository.remove(id));
  };

  const saveCurrentSearch = async () => {
    if (!currentCanBeSaved || currentIsSaved) return;
    setSavedSearches(await searchHistoryRepository.save(currentSnapshot));
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

      <div
        className="search-shell"
        role="search"
        onFocusCapture={() => setSearchHistoryOpen(true)}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            setSearchHistoryOpen(false);
          }
        }}
      >
        <Search aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Search notes"
          aria-label="Search notes"
          aria-keyshortcuts="/"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const selector = historyVisible
                ? '.search-history-popover .search-history-apply'
                : '.search-result-section .note-card-open';
              const focusTarget = () => {
                const target = document.querySelector<HTMLButtonElement>(selector);
                if (!target) return false;
                target.focus();
                return true;
              };
              if (focusTarget()) return;

              const input = event.currentTarget;
              let attempts = 0;
              const focusWhenReady = () => {
                if (document.activeElement !== input) return;
                if (focusTarget()) return;
                attempts += 1;
                if (attempts < 120) window.requestAnimationFrame(focusWhenReady);
              };
              window.requestAnimationFrame(focusWhenReady);
              return;
            }

            if (event.key !== 'Escape') return;
            if (historyVisible) {
              event.preventDefault();
              setSearchHistoryOpen(false);
              return;
            }
            if (searchQuery) {
              event.preventDefault();
              onSearchQueryChange('');
              return;
            }
            if (filtersOpen) {
              event.preventDefault();
              onToggleFilters();
              return;
            }
            if (filtersActive) {
              event.preventDefault();
              onClearSearch();
              return;
            }
            event.currentTarget.blur();
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
          {activeFilterCount > 0 ? (
            <span className="search-filter-count" aria-hidden="true">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
        {currentCanBeSaved ? (
          <button
            className="search-inline-action"
            type="button"
            aria-label={currentIsSaved ? 'Search saved' : 'Save search'}
            aria-pressed={currentIsSaved}
            data-active={currentIsSaved}
            disabled={currentIsSaved}
            onClick={() => void saveCurrentSearch()}
          >
            {currentIsSaved ? <BookmarkCheck /> : <BookmarkPlus />}
          </button>
        ) : null}
        {searchQuery || filtersActive ? (
          <button className="search-reset" type="button" onClick={onClearSearch}>
            Reset
          </button>
        ) : null}

        {historyVisible ? (
          <SearchHistoryPopover
            saved={savedSearches}
            recent={recentSearches}
            onApply={(snapshot) => {
              onApplySearch(snapshot);
              setSearchHistoryOpen(false);
            }}
            onRemoveSaved={(id) => void removeSavedSearch(id)}
            onClearRecent={() => setRecentSearches(clearRecentSearches())}
          />
        ) : null}
      </div>

      <div
        className="header-actions"
        ref={menuRef}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (moreOpen && (!(next instanceof Node) || !event.currentTarget.contains(next))) {
            setMoreOpen(false);
          }
        }}
      >
        <IconButton
          ref={moreButtonRef}
          label="More options"
          tooltip="More options"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-controls="header-more-menu"
          onClick={() => {
            if (moreOpen) {
              setMoreOpen(false);
            } else {
              openMoreMenu('first');
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              openMoreMenu('first');
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              openMoreMenu('last');
            }
          }}
          data-testid="header-more-toggle"
        >
          <MoreHorizontal />
        </IconButton>
        {moreOpen ? (
          <div
            ref={moreMenuRef}
            className="header-more-menu"
            id="header-more-menu"
            role="menu"
            aria-label="More options"
          >
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
            <button type="button" role="menuitem" onClick={() => chooseView('grid')}>
              <LayoutGrid aria-hidden="true" />
              <span>Grid view</span>
            </button>
            <button type="button" role="menuitem" onClick={() => chooseView('list')}>
              <List aria-hidden="true" />
              <span>List view</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                onSettings();
              }}
            >
              <Settings2 aria-hidden="true" />
              <span>Settings</span>
            </button>
            {lockEnabled ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  lock();
                }}
              >
                <LockKeyhole aria-hidden="true" />
                <span>Lock now</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'));
}
