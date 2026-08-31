import { Menu, Monitor, Moon, Search, StickyNote, Sun } from 'lucide-react';

import { IconButton } from './ui/IconButton';
import { useTheme } from '../theme/ThemeProvider';
import { nextThemePreference, type ThemePreference } from '../theme/theme';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { preference, cyclePreference } = useTheme();
  const nextPreference = nextThemePreference(preference);
  const ThemeIcon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;

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

      <label className="search-shell" title="Full search is implemented in P9">
        <Search aria-hidden="true" />
        <input type="search" placeholder="Search notes" aria-label="Search notes" disabled />
      </label>

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
