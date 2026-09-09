import { describe, expect, it } from 'vitest';

import {
  DESKTOP_SIDEBAR_STORAGE_KEY,
  readDesktopSidebarPreference,
  resolveShellViewport,
  writeDesktopSidebarPreference,
} from './shellLayout';

describe('shell layout contract', () => {
  it.each([
    [320, 'mobile'],
    [767, 'mobile'],
    [768, 'tablet'],
    [820, 'tablet'],
    [1100, 'tablet'],
    [1101, 'desktop'],
    [1920, 'desktop'],
  ] as const)('maps %ipx to %s', (width, expected) => {
    expect(resolveShellViewport(width)).toBe(expected);
  });

  it('persists only the desktop sidebar preference', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readDesktopSidebarPreference(storage)).toBe('expanded');
    writeDesktopSidebarPreference('compact', storage);
    expect(values.get(DESKTOP_SIDEBAR_STORAGE_KEY)).toBe('compact');
    expect(readDesktopSidebarPreference(storage)).toBe('compact');
    writeDesktopSidebarPreference('expanded', storage);
    expect(readDesktopSidebarPreference(storage)).toBe('expanded');
  });

  it('falls back to expanded when storage is unavailable or invalid', () => {
    expect(readDesktopSidebarPreference(null)).toBe('expanded');
    expect(readDesktopSidebarPreference({ getItem: () => 'broken' })).toBe('expanded');
    expect(
      readDesktopSidebarPreference({
        getItem: () => {
          throw new Error('storage blocked');
        },
      }),
    ).toBe('expanded');
  });
});
