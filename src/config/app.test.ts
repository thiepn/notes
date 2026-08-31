import { describe, expect, it } from 'vitest';

import { APP_CONFIG } from './app';

describe('APP_CONFIG', () => {
  it('keeps the production app rooted at /notes/', () => {
    expect(APP_CONFIG.basePath).toBe('/notes/');
    expect(APP_CONFIG.productionUrl).toBe('https://thiepn.dev/notes/');
  });

  it('keeps v1 local-first with cloud sync disabled', () => {
    expect(APP_CONFIG.storageMode).toBe('local-first');
    expect(APP_CONFIG.cloudSyncEnabled).toBe(false);
  });
});
