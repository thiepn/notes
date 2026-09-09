import { dispatchAppEvent, subscribeAppEvent } from './events';
import {
  readDesktopSidebarPreference,
  resolveShellViewport,
  writeDesktopSidebarPreference,
  type DesktopSidebarPreference,
  type ShellViewport,
} from './shellLayout';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Menu, NotebookPen, Plus, Search } from 'lucide-react';
import { SyncIndicator } from '../features/sync/SyncIndicator';
import { useSync } from '../features/sync/SyncContext';

import { AppHeader } from '../components/AppHeader';
import { AppSidebar, type AppSection } from '../components/AppSidebar';
import { LabelsRepository, notesDatabase, type LabelRecord } from '../db';
import type { CommandPaletteItem } from '../features/commands/CommandPalette';
import type { SettingsSection } from '../features/settings/SettingsDialog';
import {
  EMPTY_NAVIGATION_STATS,
  loadNavigationStats,
  type NavigationStats,
} from '../features/organization/navigationStats';
import {
  organizationCollectionLabelId,
  organizationCollectionMode,
  resolveOrganizationCollection,
} from '../features/organization/collectionModel';
import type { CaptureRequest } from '../features/notes/NotesWorkspace';
import {
  readNotesViewMode,
  writeNotesViewMode,
  type NotesViewMode,
} from '../features/notes/viewMode';
import {
  pruneRecentSearchLabels,
  pruneSearchFiltersToLabels,
  SearchHistoryRepository,
} from '../features/search/searchHistory';
import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';

const ACTIVE_SECTION_KEY = 'notes.active-section';
const ACTIVE_LABEL_KEY = 'notes.active-label';
const labelsRepository = new LabelsRepository(notesDatabase);
const searchHistoryRepository = new SearchHistoryRepository(notesDatabase);

const LabelManagerDialog = lazy(() =>
  import('../features/notes/LabelManagerDialog').then((module) => ({
    default: module.LabelManagerDialog,
  })),
);

const BackupWorkspace = lazy(() =>
  import('../features/backup/BackupWorkspace').then((module) => ({
    default: module.BackupWorkspace,
  })),
);
const NotesWorkspace = lazy(() =>
  import('../features/notes/NotesWorkspace').then((module) => ({
    default: module.NotesWorkspace,
  })),
);
const CommandPalette = lazy(() =>
  import('../features/commands/CommandPalette').then((module) => ({
    default: module.CommandPalette,
  })),
);
const RemindersWorkspace = lazy(() =>
  import('../features/reminders/RemindersWorkspace').then((module) => ({
    default: module.RemindersWorkspace,
  })),
);
const SearchWorkspace = lazy(() =>
  import('../features/search/SearchWorkspace').then((module) => ({
    default: module.SearchWorkspace,
  })),
);
const SettingsDialog = lazy(() =>
  import('../features/settings/SettingsDialog').then((module) => ({
    default: module.SettingsDialog,
  })),
);
const PrivacySettingsDialog = lazy(() =>
  import('../features/privacy/PrivacySettingsDialog').then((module) => ({
    default: module.PrivacySettingsDialog,
  })),
);

const SECTION_COPY: Record<
  AppSection,
  { title: string; description: string; emptyTitle: string; emptyDescription: string }
> = {
  notes: {
    title: 'Notes',
    description: 'Capture first. Organize only when it helps.',
    emptyTitle: 'Your notes will appear here',
    emptyDescription: 'Create a note to keep thoughts, lists, and useful details close at hand.',
  },
  reminders: {
    title: 'Reminders',
    description: 'Keep time-sensitive notes easy to find.',
    emptyTitle: 'No reminders yet',
    emptyDescription: 'Notes with reminders will appear here.',
  },
  archive: {
    title: 'Archive',
    description: 'Finished notes stay searchable without crowding your workspace.',
    emptyTitle: 'Your archive is empty',
    emptyDescription: 'Archived notes will appear here.',
  },
  trash: {
    title: 'Trash',
    description: 'Recover notes you removed or delete them permanently.',
    emptyTitle: 'Trash is empty',
    emptyDescription: 'Notes you move to trash will appear here.',
  },
  backup: {
    title: 'Backup',
    description: 'Protect, recover, or move notes in from Google Keep.',
    emptyTitle: 'Backup',
    emptyDescription: 'Export, restore, or import a Google Keep Takeout archive.',
  },
};

export function AppShell() {
  const { recoveryMode } = useSync();
  const [activeSection, setActiveSection] = useState<AppSection>(() => readActiveSection());
  const [activeLabelId, setActiveLabelId] = useState<string | null>(() => readActiveLabelId());
  const [labels, setLabels] = useState<LabelRecord[]>([]);
  const [navigationStats, setNavigationStats] = useState<NavigationStats>(EMPTY_NAVIGATION_STATS);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSection>('appearance');
  const [privacyLockSettingsOpen, setPrivacyLockSettingsOpen] = useState(false);
  const [desktopSidebarPreference, setDesktopSidebarPreference] =
    useState<DesktopSidebarPreference>(() => readDesktopSidebarPreference());
  const [tabletSidebarExpanded, setTabletSidebarExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [searchDestinationOpen, setSearchDestinationOpen] = useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const [captureRequest, setCaptureRequest] = useState<CaptureRequest | null>(null);
  const captureRequestIdRef = useRef(0);
  const [viewMode, setViewMode] = useState<NotesViewMode>(() => readNotesViewMode());
  const [viewportMode, setViewportMode] = useState<ShellViewport>(() =>
    typeof window === 'undefined' ? 'desktop' : resolveShellViewport(window.innerWidth),
  );
  const isMobile = viewportMode === 'mobile';
  const isTablet = viewportMode === 'tablet';
  const sidebarCompact = isMobile
    ? false
    : isTablet
      ? !tabletSidebarExpanded
      : desktopSidebarPreference === 'compact';

  const searchFiltersActive = hasSearchFilters(searchFilters);
  const searchActive =
    searchDestinationOpen ||
    Boolean(searchQuery.trim()) ||
    searchFiltersActive ||
    searchFiltersOpen;

  const refreshLabels = useCallback(async () => {
    const storedLabels = await labelsRepository.list();
    const validLabelIds = new Set(storedLabels.map((label) => label.id));
    setLabels(storedLabels);
    setActiveLabelId((current) => {
      if (!current || validLabelIds.has(current)) return current;
      persistActiveLabelId(null);
      return null;
    });
    setSearchFilters((current) => pruneSearchFiltersToLabels(current, validLabelIds));

    try {
      await searchHistoryRepository.pruneMissingLabels(validLabelIds);
      pruneRecentSearchLabels(validLabelIds);
      dispatchAppEvent('searchHistoryChanged');
    } catch {
      // Invalid saved-search label references are recoverable convenience state.
    }
  }, []);

  const refreshNavigationStats = useCallback(async () => {
    try {
      setNavigationStats(await loadNavigationStats());
    } catch {
      // Navigation counts are derived convenience state and never block note access.
    }
  }, []);

  const handleCollectionChanged = useCallback(() => {
    void refreshNavigationStats();
  }, [refreshNavigationStats]);

  useEffect(() => {
    const refresh = () => {
      void refreshLabels().catch(() => undefined);
      void refreshNavigationStats();
    };
    const unsubscribeCloudSync = subscribeAppEvent('cloudSyncApplied', refresh);
    return unsubscribeCloudSync;
  }, [refreshLabels, refreshNavigationStats]);

  useEffect(() => {
    if (!recoveryMode) return;
    const frame = requestAnimationFrame(() => {
      setSettingsInitialSection('sync');
      setSettingsOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [recoveryMode]);

  const clearSearch = useCallback(() => {
    setSearchDestinationOpen(false);
    setSearchQuery('');
    setSearchFilters({ ...DEFAULT_SEARCH_FILTERS });
    setSearchFiltersOpen(false);
  }, []);

  const handleLibraryRestored = useCallback(async () => {
    clearSearch();
    setActiveSection('notes');
    setActiveLabelId(null);
    persistActiveSection('notes');
    persistActiveLabelId(null);
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  }, [clearSearch, refreshLabels, refreshNavigationStats]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshLabels().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refreshLabels]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshNavigationStats(), 0);
    const handleReminderChanged = () => void refreshNavigationStats();
    const unsubscribeReminderChanged = subscribeAppEvent('remindersChanged', handleReminderChanged);
    return () => {
      window.clearTimeout(initialRefresh);
      unsubscribeReminderChanged();
    };
  }, [refreshNavigationStats]);

  useEffect(() => {
    const openSyncSettings = () => {
      setSettingsInitialSection('sync');
      setSettingsOpen(true);
    };
    const unsubscribeOpenSync = subscribeAppEvent('openSyncSettings', openSyncSettings);
    return unsubscribeOpenSync;
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const nextMode = resolveShellViewport(window.innerWidth);
      setViewportMode(nextMode);
      if (nextMode !== 'mobile') setMobileSidebarOpen(false);
      if (nextMode !== 'tablet') setTabletSidebarExpanded(false);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen && !tabletSidebarExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isMobile) setMobileSidebarOpen(false);
      if (isTablet) setTabletSidebarExpanded(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, isTablet, mobileSidebarOpen, tabletSidebarExpanded]);

  const handleMenu = () => {
    if (isMobile) {
      setMobileSidebarOpen((open) => !open);
      return;
    }
    if (isTablet) {
      setTabletSidebarExpanded((expanded) => !expanded);
      return;
    }

    setDesktopSidebarPreference((current) => {
      const next = current === 'expanded' ? 'compact' : 'expanded';
      writeDesktopSidebarPreference(next);
      return next;
    });
  };

  const handleNavigate = useCallback(
    (section: AppSection) => {
      clearSearch();
      setActiveSection(section);
      setActiveLabelId(null);
      persistActiveSection(section);
      persistActiveLabelId(null);
      setCommandPaletteOpen(false);

      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
    },
    [clearSearch],
  );

  const handleLabelNavigate = useCallback(
    (labelId: string) => {
      clearSearch();
      setActiveSection('notes');
      setActiveLabelId(labelId);
      persistActiveSection('notes');
      persistActiveLabelId(labelId);
      setCommandPaletteOpen(false);

      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
    },
    [clearSearch],
  );

  const handleCreateLabel = async (name: string) => {
    await labelsRepository.create(name);
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };

  const handleRenameLabel = async (labelId: string, name: string) => {
    await labelsRepository.rename(labelId, name);
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };

  const handleDeleteLabel = async (labelId: string) => {
    await labelsRepository.delete(labelId);
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await Promise.all([refreshLabels(), refreshNavigationStats()]);
  };

  const prepareNotesCapture = useCallback(
    (kind: 'text' | 'checklist') => {
      const captureLabelId =
        !searchActive && activeSection === 'notes' && activeLabelId ? activeLabelId : null;
      clearSearch();
      setCommandPaletteOpen(false);
      setActiveSection('notes');
      setActiveLabelId(captureLabelId);
      persistActiveSection('notes');
      persistActiveLabelId(captureLabelId);
      setMobileSidebarOpen(false);
      setTabletSidebarExpanded(false);
      captureRequestIdRef.current += 1;
      setCaptureRequest({ id: captureRequestIdRef.current, kind });
    },
    [activeLabelId, activeSection, clearSearch, searchActive],
  );

  const focusSearch = useCallback(() => {
    setCommandPaletteOpen(false);
    setSearchDestinationOpen(true);
    setSearchFocusRequest((request) => request + 1);
    setMobileSidebarOpen(false);
    setTabletSidebarExpanded(false);
  }, []);

  const openSearch = focusSearch;

  const openLabelManager = useCallback(() => {
    setCommandPaletteOpen(false);
    setLabelManagerOpen(true);
  }, []);

  const handleViewMode = useCallback((view: NotesViewMode) => {
    setViewMode(view);
    writeNotesViewMode(view);
  }, []);

  const setViewModeFromCommand = useCallback(
    (view: NotesViewMode) => {
      setCommandPaletteOpen(false);
      handleViewMode(view);
    },
    [handleViewMode],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const paletteChord =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLocaleLowerCase() === 'k';

      if (paletteChord) {
        if (keyboardShortcutsBlocked(event.target)) return;
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }

      if (commandPaletteOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (keyboardShortcutsBlocked(event.target)) return;

      if (!event.shiftKey) {
        const key = event.key.toLocaleLowerCase();
        if (key === 'c') {
          event.preventDefault();
          prepareNotesCapture('text');
          return;
        }
        if (key === 'j' || key === 'k') {
          event.preventDefault();
          focusAdjacentCard(key === 'j' ? 1 : -1);
          return;
        }
        if (key === 'e') {
          if (clickFocusedCardAction(['Archive note:', 'Unarchive note:'])) event.preventDefault();
          return;
        }
        if (key === 'p') {
          if (clickFocusedCardAction(['Pin note:', 'Unpin note:'])) event.preventDefault();
          return;
        }
        if (event.key === 'Delete') {
          if (clickFocusedCardAction(['Move note to trash:'])) event.preventDefault();
          return;
        }
      }

      if (event.key === '#') {
        if (clickFocusedCardAction(['Change labels:'])) {
          event.preventDefault();
          afterUiUpdate(() => {
            const card = getFocusedCard();
            card?.querySelector<HTMLInputElement>('.note-label-picker input')?.focus();
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, prepareNotesCapture]);

  const activeLabel = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId) ?? null)
    : null;
  const organizationCollection = resolveOrganizationCollection(
    activeSection,
    activeLabel?.id ?? null,
  );
  const organizationMode = organizationCollection
    ? organizationCollectionMode(organizationCollection)
    : 'notes';
  const organizationLabelId = organizationCollection
    ? organizationCollectionLabelId(organizationCollection)
    : null;
  const normalSection = activeLabel
    ? {
        title: activeLabel.name,
        description: `Active notes labeled “${activeLabel.name}”.`,
        emptyTitle: `No notes labeled “${activeLabel.name}”`,
        emptyDescription: 'Create a note here or add this label to an existing note.',
      }
    : SECTION_COPY[activeSection];
  const section = searchActive
    ? {
        title: 'Search',
        description: 'Search active and archived notes without leaving your local workspace.',
        emptyTitle: 'No matching notes',
        emptyDescription: 'Try a broader query or remove a filter.',
      }
    : normalSection;
  const lifecycleSection = organizationCollection !== null;

  const activeWorkspaceCount =
    searchActive || activeSection === 'backup'
      ? null
      : activeLabel
        ? (navigationStats.labels[activeLabel.id] ?? 0)
        : activeSection === 'notes'
          ? navigationStats.notes
          : activeSection === 'reminders'
            ? navigationStats.reminders
            : activeSection === 'archive'
              ? navigationStats.archive
              : navigationStats.trash;
  const activeWorkspaceCountLabel =
    activeWorkspaceCount === null
      ? null
      : activeSection === 'reminders' && activeLabel === null
        ? `${activeWorkspaceCount} active ${activeWorkspaceCount === 1 ? 'reminder' : 'reminders'}`
        : `${activeWorkspaceCount} ${activeWorkspaceCount === 1 ? 'note' : 'notes'}`;
  const labelPaletteCommands: CommandPaletteItem[] = labels.map((label) => {
    const count = navigationStats.labels[label.id] ?? 0;
    return {
      id: `open-label:${label.id}`,
      label: `Open label: ${label.name}`,
      description: `${count} active ${count === 1 ? 'note' : 'notes'}`,
      group: 'Labels',
      keywords: ['label', 'tag', label.name],
      run: () => handleLabelNavigate(label.id),
    };
  });

  const paletteCommands: CommandPaletteItem[] = [
    {
      id: 'new-text-note',
      label: 'New text note',
      description: 'Start typing immediately',
      group: 'Create',
      shortcut: 'C',
      keywords: ['capture', 'note'],
      run: () => prepareNotesCapture('text'),
    },
    {
      id: 'new-checklist',
      label: 'New checklist',
      description: 'Create a checklist note',
      group: 'Create',
      keywords: ['list', 'tasks'],
      run: () => prepareNotesCapture('checklist'),
    },
    {
      id: 'search-notes',
      label: 'Search notes',
      description: 'Focus global local search',
      group: 'Navigate',
      shortcut: '/',
      keywords: ['find', 'filter'],
      run: focusSearch,
    },
    {
      id: 'open-notes',
      label: 'Open Notes',
      description: 'Return to active notes',
      group: 'Navigate',
      keywords: ['home'],
      run: () => handleNavigate('notes'),
    },
    {
      id: 'open-reminders',
      label: 'Open Reminders',
      description: 'Browse upcoming and past reminders',
      group: 'Navigate',
      keywords: ['reminder', 'time', 'due', 'snooze'],
      run: () => handleNavigate('reminders'),
    },
    {
      id: 'open-archive',
      label: 'Open Archive',
      description: 'Browse archived notes',
      group: 'Navigate',
      keywords: ['archived'],
      run: () => handleNavigate('archive'),
    },
    {
      id: 'open-trash',
      label: 'Open Trash',
      description: 'Restore or permanently delete notes',
      group: 'Navigate',
      keywords: ['deleted'],
      run: () => handleNavigate('trash'),
    },
    {
      id: 'open-backup',
      label: 'Backup, restore, and import',
      description: 'Export, recover, or import Google Keep Takeout',
      group: 'Navigate',
      keywords: ['backup', 'restore', 'recovery', 'export', 'import', 'google', 'keep', 'takeout'],
      run: () => handleNavigate('backup'),
    },
    {
      id: 'manage-labels',
      label: 'Create or manage labels',
      description: 'Add, rename, or delete labels',
      group: 'Organize',
      keywords: ['tag', 'label'],
      run: openLabelManager,
    },
    ...labelPaletteCommands,
    {
      id: 'grid-view',
      label: 'Grid view',
      description: 'Show notes in the masonry grid',
      group: 'View',
      keywords: ['layout', 'cards'],
      run: () => setViewModeFromCommand('grid'),
    },
    {
      id: 'list-view',
      label: 'List view',
      description: 'Show notes in one column',
      group: 'View',
      keywords: ['layout', 'rows'],
      run: () => setViewModeFromCommand('list'),
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      description: 'Appearance, privacy, notifications, search history, and data tools',
      group: 'Navigate',
      keywords: [
        'settings',
        'preferences',
        'theme',
        'appearance',
        'privacy',
        'notifications',
        'history',
        'backup',
      ],
      run: () => {
        setCommandPaletteOpen(false);
        setSettingsInitialSection('appearance');
        setSettingsOpen(true);
      },
    },
  ];

  return (
    <div
      className="app-shell"
      data-viewport={viewportMode}
      data-sidebar={sidebarCompact ? 'compact' : 'expanded'}
    >
      <a className="skip-link" href="#main-content">
        Skip to notes
      </a>
      <AppHeader
        onMenu={handleMenu}
        navigationOpen={
          isMobile
            ? mobileSidebarOpen
            : isTablet
              ? tabletSidebarExpanded
              : desktopSidebarPreference === 'expanded'
        }
        onCommandPalette={() => setCommandPaletteOpen(true)}
        onSettings={() => {
          setSettingsInitialSection('appearance');
          setSettingsOpen(true);
        }}
        onViewModeChange={handleViewMode}
        searchFocusRequest={searchFocusRequest}
        searchQuery={searchQuery}
        searchFilters={searchFilters}
        filtersOpen={searchFiltersOpen}
        filtersActive={searchFiltersActive}
        onSearchQueryChange={setSearchQuery}
        onToggleFilters={() => setSearchFiltersOpen((open) => !open)}
        onClearSearch={clearSearch}
        onApplySearch={(snapshot) => {
          setSearchQuery(snapshot.query);
          setSearchFilters({
            ...snapshot.filters,
            colors: [...snapshot.filters.colors],
            labelIds: [...snapshot.filters.labelIds],
          });
          setSearchFiltersOpen(false);
        }}
      />

      <div className="app-body">
        <AppSidebar
          activeSection={activeSection}
          activeLabelId={activeLabel?.id ?? null}
          searchActive={searchActive}
          labels={labels}
          counts={navigationStats}
          compact={sidebarCompact}
          mobileOpen={mobileSidebarOpen}
          mobile={isMobile}
          tablet={isTablet}
          onNavigate={handleNavigate}
          onSearch={openSearch}
          onLabelNavigate={handleLabelNavigate}
          onManageLabels={openLabelManager}
          onCreateNote={() => prepareNotesCapture('text')}
          onCommands={() => {
            setMobileSidebarOpen(false);
            setTabletSidebarExpanded(false);
            setCommandPaletteOpen(true);
          }}
          onSettings={() => {
            setMobileSidebarOpen(false);
            setTabletSidebarExpanded(false);
            setSettingsInitialSection('appearance');
            setSettingsOpen(true);
          }}
          onCloseNavigation={() => setMobileSidebarOpen(false)}
        />

        {isMobile && mobileSidebarOpen ? (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <main
          className="app-main"
          id="main-content"
          tabIndex={-1}
          inert={isMobile && mobileSidebarOpen}
        >
          <div className={`workspace${searchActive ? ' workspace-search-active' : ''}`}>
            <header className="workspace-heading">
              <div>
                <p className="workspace-kicker">Your notebook</p>
                <div className="workspace-title-line">
                  <h1>{section.title}</h1>
                  {activeWorkspaceCountLabel ? (
                    <span className="workspace-count">{activeWorkspaceCountLabel}</span>
                  ) : null}
                </div>
                <p>{section.description}</p>
              </div>
              <div className="workspace-meta">
                <time className="workspace-date" dateTime={new Date().toISOString().slice(0, 10)}>
                  {new Date().toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
                <SyncIndicator />
              </div>
            </header>

            {searchActive ? (
              <Suspense fallback={<DeferredWorkspaceFallback label="Loading search…" />}>
                <SearchWorkspace
                  query={searchQuery}
                  viewMode={viewMode}
                  onViewModeChange={handleViewMode}
                  filters={searchFilters}
                  filtersOpen={searchFiltersOpen}
                  labels={labels}
                  onFiltersChange={setSearchFilters}
                  onCloseFilters={() => setSearchFiltersOpen(false)}
                  onClearSearch={clearSearch}
                  onCollectionChanged={handleCollectionChanged}
                />
              </Suspense>
            ) : activeSection === 'backup' ? (
              <Suspense fallback={<DeferredWorkspaceFallback label="Loading backup tools…" />}>
                <BackupWorkspace onRestored={handleLibraryRestored} onImported={refreshLabels} />
              </Suspense>
            ) : activeSection === 'reminders' ? (
              <Suspense fallback={<DeferredWorkspaceFallback label="Loading reminders…" />}>
                <RemindersWorkspace
                  labels={labels}
                  viewMode={viewMode}
                  onViewModeChange={handleViewMode}
                />
              </Suspense>
            ) : lifecycleSection ? (
              <Suspense fallback={<DeferredWorkspaceFallback label="Loading notes…" />}>
                <NotesWorkspace
                  mode={organizationMode}
                  labels={labels}
                  filterLabelId={organizationLabelId}
                  viewMode={viewMode}
                  onViewModeChange={handleViewMode}
                  captureRequest={captureRequest}
                  onCaptureRequestHandled={(requestId) =>
                    setCaptureRequest((current) => (current?.id === requestId ? null : current))
                  }
                  onCollectionChanged={handleCollectionChanged}
                />
              </Suspense>
            ) : (
              <SectionPlaceholder
                title={section.emptyTitle}
                description={section.emptyDescription}
              />
            )}
          </div>
        </main>
      </div>

      <nav className="mobile-navigation" aria-label="Mobile navigation" inert={mobileSidebarOpen}>
        <button
          type="button"
          aria-label="Show notes"
          aria-current={activeSection === 'notes' && !searchActive ? 'page' : undefined}
          onClick={() => handleNavigate('notes')}
        >
          <NotebookPen aria-hidden="true" />
          <span>Notes</span>
        </button>
        <button
          type="button"
          aria-label="Find a note"
          aria-current={searchActive ? 'page' : undefined}
          onClick={openSearch}
        >
          <Search aria-hidden="true" />
          <span>Search</span>
        </button>
        <button
          type="button"
          className="mobile-create"
          aria-label="New note"
          onClick={() => prepareNotesCapture('text')}
        >
          <Plus aria-hidden="true" />
          <span>New</span>
        </button>
        <button
          type="button"
          aria-label="Show reminders"
          aria-current={activeSection === 'reminders' && !searchActive ? 'page' : undefined}
          onClick={() => handleNavigate('reminders')}
        >
          <Bell aria-hidden="true" />
          <span>Reminders</span>
        </button>
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileSidebarOpen}
          aria-controls="app-navigation"
          onClick={handleMenu}
        >
          <Menu aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {settingsOpen ? (
        <Suspense fallback={<div className="deferred-settings-loading">Loading settings…</div>}>
          <SettingsDialog
            initialSection={settingsInitialSection}
            onClose={() => setSettingsOpen(false)}
            onOpenBackup={() => {
              setSettingsOpen(false);
              handleNavigate('backup');
            }}
            onOpenPrivacyLock={() => {
              setSettingsOpen(false);
              setPrivacyLockSettingsOpen(true);
            }}
          />
        </Suspense>
      ) : null}

      {privacyLockSettingsOpen ? (
        <Suspense fallback={null}>
          <PrivacySettingsDialog
            lockOnly
            onClose={() => {
              setPrivacyLockSettingsOpen(false);
              setSettingsInitialSection('privacy');
              setSettingsOpen(true);
            }}
          />
        </Suspense>
      ) : null}

      {labelManagerOpen ? (
        <Suspense fallback={null}>
          <LabelManagerDialog
            labels={labels}
            counts={navigationStats.labels}
            onClose={() => setLabelManagerOpen(false)}
            onCreate={handleCreateLabel}
            onRename={handleRenameLabel}
            onDelete={handleDeleteLabel}
          />
        </Suspense>
      ) : null}

      {commandPaletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

function DeferredWorkspaceFallback({ label }: { label: string }) {
  return (
    <div className="deferred-workspace-loading" role="status" aria-live="polite">
      {label}
    </div>
  );
}

function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state" aria-labelledby="section-placeholder-title">
      <span className="empty-state-icon" aria-hidden="true">
        <NotebookPen />
      </span>
      <h2 id="section-placeholder-title">{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function keyboardShortcutsBlocked(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return true;
  }
  return Boolean(document.querySelector('[role="dialog"], .note-composer'));
}

function focusAdjacentCard(direction: 1 | -1): void {
  const cards = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button.note-card-open'),
  ).filter((button) => button.getClientRects().length > 0);
  if (cards.length === 0) return;

  const active = document.activeElement;
  const currentIndex = cards.findIndex(
    (button) => button === active || button.closest('[data-note-card]')?.contains(active),
  );
  const nextIndex =
    currentIndex < 0
      ? direction === 1
        ? 0
        : cards.length - 1
      : (currentIndex + direction + cards.length) % cards.length;
  const next = cards[nextIndex];
  next?.focus();
  next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function getFocusedCard(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest<HTMLElement>('[data-note-card]') : null;
}

function clickFocusedCardAction(prefixes: string[]): boolean {
  const card = getFocusedCard();
  if (!card) return false;
  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
  const action = buttons.find((button) => {
    const label = button.getAttribute('aria-label') ?? '';
    return prefixes.some((prefix) => label.startsWith(prefix));
  });
  if (!action || action.disabled) return false;
  action.click();
  return true;
}

function afterUiUpdate(callback: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
}

function readActiveSection(): AppSection {
  if (typeof window === 'undefined') return 'notes';

  try {
    const stored = window.localStorage.getItem(ACTIVE_SECTION_KEY);
    return stored === 'reminders' ||
      stored === 'archive' ||
      stored === 'trash' ||
      stored === 'backup'
      ? stored
      : 'notes';
  } catch {
    return 'notes';
  }
}

function persistActiveSection(section: AppSection): void {
  try {
    window.localStorage.setItem(ACTIVE_SECTION_KEY, section);
  } catch {
    // Navigation still works when storage is unavailable.
  }
}

function readActiveLabelId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_LABEL_KEY);
  } catch {
    return null;
  }
}

function persistActiveLabelId(labelId: string | null): void {
  try {
    if (labelId) window.localStorage.setItem(ACTIVE_LABEL_KEY, labelId);
    else window.localStorage.removeItem(ACTIVE_LABEL_KEY);
  } catch {
    // Label navigation still works when storage is unavailable.
  }
}
