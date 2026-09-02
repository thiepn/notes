import { useCallback, useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';

import { AppHeader } from '../components/AppHeader';
import { AppSidebar, type AppSection } from '../components/AppSidebar';
import { BackupWorkspace } from '../features/backup/BackupWorkspace';
import { LabelsRepository, notesDatabase, type LabelRecord } from '../db';
import { CommandPalette, type CommandPaletteItem } from '../features/commands/CommandPalette';
import { LabelManagerDialog } from '../features/notes/LabelManagerDialog';
import { NotesWorkspace } from '../features/notes/NotesWorkspace';
import { RemindersWorkspace } from '../features/reminders/RemindersWorkspace';
import { SearchWorkspace } from '../features/search/SearchWorkspace';
import {
  DEFAULT_SEARCH_FILTERS,
  hasSearchFilters,
  type SearchFilters,
} from '../features/search/searchTypes';
import { useTheme } from '../theme/ThemeContext';

const MOBILE_QUERY = '(max-width: 767px)';
const ACTIVE_SECTION_KEY = 'notes.active-section';
const ACTIVE_LABEL_KEY = 'notes.active-label';
const labelsRepository = new LabelsRepository(notesDatabase);

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
  const { cyclePreference } = useTheme();
  const [activeSection, setActiveSection] = useState<AppSection>(() => readActiveSection());
  const [activeLabelId, setActiveLabelId] = useState<string | null>(() => readActiveLabelId());
  const [labels, setLabels] = useState<LabelRecord[]>([]);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({ ...DEFAULT_SEARCH_FILTERS });
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches,
  );

  const searchFiltersActive = hasSearchFilters(searchFilters);
  const searchActive = Boolean(searchQuery.trim()) || searchFiltersActive || searchFiltersOpen;

  const refreshLabels = useCallback(async () => {
    setLabels(await labelsRepository.list());
  }, []);

  const clearSearch = useCallback(() => {
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
    await refreshLabels();
  }, [clearSearch, refreshLabels]);

  useEffect(() => {
    let cancelled = false;

    void labelsRepository.list().then((storedLabels) => {
      if (cancelled) return;
      setLabels(storedLabels);
      setActiveLabelId((current) => {
        if (!current || storedLabels.some((label) => label.id === current)) return current;
        persistActiveLabelId(null);
        return null;
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setMobileSidebarOpen(false);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen]);

  const handleMenu = () => {
    if (isMobile) {
      setMobileSidebarOpen((open) => !open);
      return;
    }

    setSidebarCompact((compact) => !compact);
  };

  const handleNavigate = useCallback(
    (section: AppSection) => {
      clearSearch();
      setActiveSection(section);
      setActiveLabelId(null);
      persistActiveSection(section);
      persistActiveLabelId(null);
      setCommandPaletteOpen(false);

      if (isMobile) setMobileSidebarOpen(false);
    },
    [clearSearch, isMobile],
  );

  const handleLabelNavigate = useCallback(
    (labelId: string) => {
      clearSearch();
      setActiveSection('notes');
      setActiveLabelId(labelId);
      persistActiveSection('notes');
      persistActiveLabelId(labelId);
      setCommandPaletteOpen(false);

      if (isMobile) setMobileSidebarOpen(false);
    },
    [clearSearch, isMobile],
  );

  const handleCreateLabel = async (name: string) => {
    await labelsRepository.create(name);
    await refreshLabels();
  };

  const handleRenameLabel = async (labelId: string, name: string) => {
    await labelsRepository.rename(labelId, name);
    await refreshLabels();
  };

  const handleDeleteLabel = async (labelId: string) => {
    await labelsRepository.delete(labelId);
    setSearchFilters((current) => ({
      ...current,
      labelIds: current.labelIds.filter((id) => id !== labelId),
    }));
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await refreshLabels();
  };

  const prepareNotesCapture = useCallback(
    (kind: 'text' | 'checklist') => {
      clearSearch();
      setCommandPaletteOpen(false);
      if (activeSection !== 'notes') {
        setActiveSection('notes');
        setActiveLabelId(null);
        persistActiveSection('notes');
        persistActiveLabelId(null);
      }

      afterUiUpdate(() => {
        const selector =
          kind === 'text'
            ? 'button[aria-label="Create a text note"]'
            : 'button[aria-label="Create a checklist"]';
        document.querySelector<HTMLButtonElement>(selector)?.click();
      });
    },
    [activeSection, clearSearch],
  );

  const focusSearch = useCallback(() => {
    setCommandPaletteOpen(false);
    afterUiUpdate(() => {
      document.querySelector<HTMLInputElement>('input[aria-label="Search notes"]')?.focus();
    });
  }, []);

  const openLabelManager = useCallback(() => {
    setCommandPaletteOpen(false);
    setLabelManagerOpen(true);
    afterUiUpdate(() => {
      document.querySelector<HTMLInputElement>('input[aria-label="New label name"]')?.focus();
    });
  }, []);

  const setViewModeFromCommand = useCallback((view: 'grid' | 'list') => {
    setCommandPaletteOpen(false);
    afterUiUpdate(() => {
      document
        .querySelector<HTMLButtonElement>(
          `button[aria-label="${view === 'grid' ? 'Grid' : 'List'} view"]`,
        )
        ?.click();
    });
  }, []);

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
  const lifecycleSection =
    activeLabel !== null ||
    activeSection === 'notes' ||
    activeSection === 'archive' ||
    activeSection === 'trash';

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
      id: 'cycle-appearance',
      label: 'Cycle appearance',
      description: 'Switch System, Light, and Dark appearance',
      group: 'View',
      keywords: ['theme', 'dark', 'light'],
      run: cyclePreference,
    },
  ];

  return (
    <div className="app-shell">
      <AppHeader
        onMenu={handleMenu}
        onCommandPalette={() => setCommandPaletteOpen(true)}
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
          labels={labels}
          compact={sidebarCompact}
          mobileOpen={mobileSidebarOpen}
          mobile={isMobile}
          onNavigate={handleNavigate}
          onLabelNavigate={handleLabelNavigate}
          onManageLabels={openLabelManager}
        />

        {isMobile && mobileSidebarOpen ? (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}

        <main className="app-main" id="main-content">
          <div className={`workspace${searchActive ? ' workspace-search-active' : ''}`}>
            <header className="workspace-heading">
              <div>
                <p className="workspace-kicker">Local workspace</p>
                <h1>{section.title}</h1>
                <p>{section.description}</p>
              </div>
              <span className="local-badge">Local only</span>
            </header>

            {searchActive ? (
              <SearchWorkspace
                query={searchQuery}
                filters={searchFilters}
                filtersOpen={searchFiltersOpen}
                labels={labels}
                onFiltersChange={setSearchFilters}
                onCloseFilters={() => setSearchFiltersOpen(false)}
                onClearSearch={clearSearch}
              />
            ) : activeSection === 'backup' ? (
              <BackupWorkspace onRestored={handleLibraryRestored} onImported={refreshLabels} />
            ) : activeSection === 'reminders' ? (
              <RemindersWorkspace labels={labels} />
            ) : lifecycleSection ? (
              <NotesWorkspace
                mode={activeLabel ? 'notes' : activeSection}
                labels={labels}
                filterLabelId={activeLabel?.id ?? null}
              />
            ) : (
              <SectionPlaceholder
                title={section.emptyTitle}
                description={section.emptyDescription}
              />
            )}
          </div>
        </main>
      </div>

      {labelManagerOpen ? (
        <LabelManagerDialog
          labels={labels}
          onClose={() => setLabelManagerOpen(false)}
          onCreate={handleCreateLabel}
          onRename={handleRenameLabel}
          onDelete={handleDeleteLabel}
        />
      ) : null}

      {commandPaletteOpen ? (
        <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />
      ) : null}
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
