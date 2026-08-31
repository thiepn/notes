import { useEffect, useState } from 'react';
import { ImagePlus, ListChecks, NotebookPen } from 'lucide-react';

import { AppHeader } from '../components/AppHeader';
import { AppSidebar, type AppSection } from '../components/AppSidebar';

const MOBILE_QUERY = '(max-width: 767px)';

const SECTION_COPY: Record<AppSection, { title: string; description: string }> = {
  notes: {
    title: 'Notes',
    description: 'Capture first. Organize only when it helps.',
  },
  reminders: {
    title: 'Reminders',
    description: 'Time-based note views arrive in a later phase.',
  },
  archive: {
    title: 'Archive',
    description: 'Finished notes stay searchable without crowding your workspace.',
  },
  trash: {
    title: 'Trash',
    description: 'Deleted notes remain recoverable until you remove them permanently.',
  },
};

export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>('notes');
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches,
  );

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
    if (!mobileSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
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
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  const section = SECTION_COPY[activeSection];

  return (
    <div className="app-shell">
      <AppHeader onMenu={handleMenu} />

      <div className="app-body">
        <AppSidebar
          activeSection={activeSection}
          compact={sidebarCompact}
          mobileOpen={mobileSidebarOpen}
          mobile={isMobile}
          onNavigate={handleNavigate}
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

            {activeSection === 'notes' ? (
              <NotesWorkspacePreview />
            ) : (
              <SectionPlaceholder title={section.title} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function NotesWorkspacePreview() {
  return (
    <>
      <section className="composer-preview" aria-label="Note composer preview">
        <span className="composer-placeholder">Take a note…</span>
        <span className="composer-actions" aria-hidden="true">
          <ListChecks />
          <ImagePlus />
        </span>
      </section>

      <section className="empty-state" aria-labelledby="empty-notes-title">
        <span className="empty-state-icon" aria-hidden="true">
          <NotebookPen />
        </span>
        <h2 id="empty-notes-title">Your notes will appear here</h2>
        <p>P3 connects this shell to instant local note capture and auto-save.</p>
      </section>
    </>
  );
}

function SectionPlaceholder({ title }: { title: string }) {
  return (
    <section className="empty-state" aria-labelledby="section-placeholder-title">
      <span className="empty-state-icon" aria-hidden="true">
        <NotebookPen />
      </span>
      <h2 id="section-placeholder-title">No {title.toLowerCase()} yet</h2>
      <p>This view is structurally ready and will connect to its data phase later.</p>
    </section>
  );
}
