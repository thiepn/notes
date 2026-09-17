import { describe, expect, it } from 'vitest';

import {
  SHARE_CAPTURE_LEDGER_SETTING_PREFIX,
  SYNC_SHADOW_SETTING_PREFIX,
  isPortableSettingKey,
  syncShadowSettingKey,
} from './internalSettings';

describe('internal settings', () => {
  it('keeps ordinary user/device settings portable', () => {
    expect(isPortableSettingKey('appearance.theme')).toBe(true);
    expect(isPortableSettingKey('search.saved.v1')).toBe(true);
  });

  it('keeps current and future sync acknowledgement shadows device-local', () => {
    const key = syncShadowSettingKey('user-123');
    expect(key).toBe('sync.supabase.shadow.v2:user-123');
    expect(key.startsWith(SYNC_SHADOW_SETTING_PREFIX)).toBe(true);
    expect(isPortableSettingKey(key)).toBe(false);
    expect(isPortableSettingKey('sync.supabase.shadow.v3:user-123')).toBe(false);
  });

  it('keeps exact-once share capture ledgers device-local', () => {
    const key = `${SHARE_CAPTURE_LEDGER_SETTING_PREFIX}v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    expect(isPortableSettingKey(key)).toBe(false);
    expect(isPortableSettingKey('internal.share-capture.v2:future')).toBe(false);
  });
});
