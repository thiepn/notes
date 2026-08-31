import { describe, expect, it } from 'vitest';

import {
  isThemePreference,
  nextThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme utilities', () => {
  it('resolves system appearance without changing explicit choices', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('cycles through system, light, and dark predictably', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });

  it('accepts only supported persisted theme preferences', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('falls back to system when storage is empty or invalid', () => {
    const validStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? 'dark' : null) };
    const invalidStorage = { getItem: () => 'sepia' };

    expect(readThemePreference(validStorage)).toBe('dark');
    expect(readThemePreference(invalidStorage)).toBe('system');
    expect(readThemePreference(null)).toBe('system');
  });
});
