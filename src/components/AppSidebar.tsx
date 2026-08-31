import { Archive, Bell, Lightbulb, ShieldCheck, Tag, Trash2 } from 'lucide-react';

export type AppSection = 'notes' | 'reminders' | 'archive' | 'trash';

interface AppSidebarProps {
  activeSection: AppSection;
  compact: boolean;
  mobileOpen: boolean;
  mobile: boolean;
  onNavigate: (section: AppSection) => void;
}

const NAVIGATION = [
  { id: 'notes', label: 'Notes', icon: Lightbulb },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] satisfies Array<{ id: AppSection; label: string; icon: typeof Lightbulb }>;

export function AppSidebar({
  activeSection,
  compact,
  mobileOpen,
  mobile,
  onNavigate,
}: AppSidebarProps) {
  return (
    <aside
      className="app-sidebar"
      id="app-navigation"
      aria-label="Primary navigation"
      aria-hidden={mobile && !mobileOpen}
      data-compact={compact}
      data-open={mobileOpen}
      data-testid="app-sidebar"
      inert={mobile && !mobileOpen}
    >
      <nav className="sidebar-nav">
        {NAVIGATION.slice(0, 2).map(({ id, label, icon: Icon }) => (
          <button
            className="nav-item"
            type="button"
            data-active={activeSection === id}
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            key={id}
          >
            <Icon aria-hidden="true" />
            <span className="nav-label">{label}</span>
          </button>
        ))}

        <div className="sidebar-section">
          <div className="sidebar-section-heading">
            <Tag aria-hidden="true" />
            <span>Labels</span>
          </div>
          <p className="sidebar-empty-labels">No labels yet</p>
        </div>

        {NAVIGATION.slice(2).map(({ id, label, icon: Icon }) => (
          <button
            className="nav-item"
            type="button"
            data-active={activeSection === id}
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            key={id}
          >
            <Icon aria-hidden="true" />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Local-first</strong>
          <span>Stored on this device</span>
        </div>
      </div>
    </aside>
  );
}
