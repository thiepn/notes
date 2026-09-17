export const SYNC_SHADOW_SETTING_PREFIX = 'sync.supabase.shadow.';
export const SHARE_CAPTURE_LEDGER_SETTING_PREFIX = 'internal.share-capture.';
const CURRENT_SYNC_SHADOW_SETTING_PREFIX = `${SYNC_SHADOW_SETTING_PREFIX}v2:`;

export function syncShadowSettingKey(userId: string): string {
  return `${CURRENT_SYNC_SHADOW_SETTING_PREFIX}${userId}`;
}

export function isPortableSettingKey(key: string): boolean {
  return (
    !key.startsWith(SYNC_SHADOW_SETTING_PREFIX) &&
    !key.startsWith(SHARE_CAPTURE_LEDGER_SETTING_PREFIX)
  );
}
