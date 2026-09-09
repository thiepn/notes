export type ShellViewport = 'mobile' | 'tablet' | 'desktop';
export type DesktopSidebarPreference = 'expanded' | 'compact';

export const SHELL_BREAKPOINTS = {
  mobileMax: 767,
  tabletMax: 1100,
} as const;

export const DESKTOP_SIDEBAR_STORAGE_KEY = 'notes.shell.sidebar';

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void;
}

export function resolveShellViewport(width: number): ShellViewport {
  if (width <= SHELL_BREAKPOINTS.mobileMax) return 'mobile';
  if (width <= SHELL_BREAKPOINTS.tabletMax) return 'tablet';
  return 'desktop';
}

export function readDesktopSidebarPreference(
  storage: StorageReader | null = defaultStorage(),
): DesktopSidebarPreference {
  try {
    return storage?.getItem(DESKTOP_SIDEBAR_STORAGE_KEY) === 'compact' ? 'compact' : 'expanded';
  } catch {
    return 'expanded';
  }
}

export function writeDesktopSidebarPreference(
  preference: DesktopSidebarPreference,
  storage: StorageWriter | null = defaultStorage(),
): void {
  try {
    storage?.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, preference);
  } catch {
    // Layout persistence is optional; navigation remains usable for the current session.
  }
}

function defaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
