export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'notes.theme';

export function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return preference;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const currentIndex = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(currentIndex + 1) % THEME_PREFERENCES.length] ?? 'system';
}

export function readThemePreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  if (!storage) {
    return 'system';
  }

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}
