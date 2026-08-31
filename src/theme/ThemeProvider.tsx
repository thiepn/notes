import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { ThemeContext, type ThemeContextValue } from './ThemeContext';
import {
  nextThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readThemePreference(window.localStorage),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(DARK_MEDIA_QUERY).matches,
  );
  const resolvedTheme = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute('content', resolvedTheme === 'dark' ? '#111318' : '#f6f7f9');
  }, [resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // Theme persistence is non-critical; the active session still updates.
    }
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference(nextThemePreference(preference));
  }, [preference, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference, cyclePreference }),
    [cyclePreference, preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
