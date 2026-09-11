import { describe, expect, it } from 'vitest';

import {
  SYNC_SHADOW_SETTING_PREFIX,
  isPortableSettingKey,
  syncShadowSettingKey,
} from './internalSettings';

describe('internal settings', () => {
  it('keeps ordinary user/device settings portable', () => {
    expect(isPortableSettingKey('appearance.theme')).toBe(true);
    expect(isPortableSettingKey('search.saved.v1')).toBe(true);
  });

  it('keeps per-account sync acknowledgement shadows device-local', () => {
    const key = syncShadowSettingKey('user-123');
    expect(key).toBe(`${SYNC_SHADOW_SETTING_PREFIX}user-123`);
    expect(isPortableSettingKey(key)).toBe(false);
  });
});
