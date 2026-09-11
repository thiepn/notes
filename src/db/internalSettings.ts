export const SYNC_SHADOW_SETTING_PREFIX = 'sync.supabase.shadow.v2:';

export function syncShadowSettingKey(userId: string): string {
  return `${SYNC_SHADOW_SETTING_PREFIX}${userId}`;
}

export function isPortableSettingKey(key: string): boolean {
  return !key.startsWith(SYNC_SHADOW_SETTING_PREFIX);
}
