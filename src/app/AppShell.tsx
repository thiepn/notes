import { useCallback, useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';

import { AppHeader } from '../components/AppHeader';
import { AppSidebar, type AppSection } from '../components/AppSidebar';
import { LabelsRepository, notesDatabase, type LabelRecord } from '../db';
import { LabelManagerDialog } from '../features/notes/LabelManagerDialog';
import { NotesWorkspace } from '../features/notes/NotesWorkspace';

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
};

export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>(() => readActiveSection());
  const [activeLabelId, setActiveLabelId] = useState<string | null>(() => readActiveLabelId());
  const [labels, setLabels] = useState<LabelRecord[]>([]);
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches,
  );

  const refreshLabels = useCallback(async () => {
    setLabels(await labelsRepository.list());
  }, []);

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

  const handleNavigate = (section: AppSection) => {
    setActiveSection(section);
    setActiveLabelId(null);
    persistActiveSection(section);
    persistActiveLabelId(null);

    if (isMobile) setMobileSidebarOpen(false);
  };

  const handleLabelNavigate = (labelId: string) => {
    setActiveSection('notes');
    setActiveLabelId(labelId);
    persistActiveSection('notes');
    persistActiveLabelId(labelId);

    if (isMobile) setMobileSidebarOpen(false);
  };

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
    if (activeLabelId === labelId) {
      setActiveLabelId(null);
      setActiveSection('notes');
      persistActiveLabelId(null);
      persistActiveSection('notes');
    }
    await refreshLabels();
  };

  const activeLabel = activeLabelId
    ? (labels.find((label) => label.id === activeLabelId) ?? null)
    : null;
  const section = activeLabel
    ? {
        title: activeLabel.name,
        description: `Active notes labeled “${activeLabel.name}”.`,
        emptyTitle: `No notes labeled “${activeLabel.name}”`,
        emptyDescription: 'Create a note here or add this label to an existing note.',
      }
    : SECTION_COPY[activeSection];
  const lifecycleSection =
    activeLabel !== null ||
    activeSection === 'notes' ||
    activeSection === 'archive' ||
    activeSection === 'trash';

  return (
    <div className="app-shell">
      <AppHeader onMenu={handleMenu} />

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
          onManageLabels={() => setLabelManagerOpen(true)}
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
          <div className="workspace">
            <header className="workspace-heading">
              <div>
                <p className="workspace-kicker">Local workspace</p>
                <h1>{section.title}</h1>
                <p>{section.description}</p>
              </div>
              <span className="local-badge">Local only</span>
            </header>

            {lifecycleSection ? (
              <NotesWorkspace
                mode={
                  activeLabel ? 'notes' : activeSection === 'reminders' ? 'notes' : activeSection
                }
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

function readActiveSection(): AppSection {
  if (typeof window === 'undefined') return 'notes';

  try {
    const stored = window.localStorage.getItem(ACTIVE_SECTION_KEY);
    return stored === 'reminders' || stored === 'archive' || stored === 'trash' ? stored : 'notes';
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
