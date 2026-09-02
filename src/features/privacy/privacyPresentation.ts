export interface PrivacyProtectionSummary {
  enabledCount: number;
  totalCount: 3;
  label: string;
  detail: string;
}

export function privacyProtectionSummary(input: {
  lockEnabled: boolean;
  hidePreviews: boolean;
  privateNotifications: boolean;
}): PrivacyProtectionSummary {
  const enabledCount =
    Number(input.lockEnabled) + Number(input.hidePreviews) + Number(input.privateNotifications);
  const label =
    enabledCount === 3
      ? 'All passive privacy controls are on'
      : enabledCount === 0
        ? 'Passive privacy controls are off'
        : `${enabledCount} of 3 passive privacy controls ${enabledCount === 1 ? 'is' : 'are'} on`;
  const detail = [
    input.lockEnabled ? 'privacy lock enabled' : 'privacy lock off',
    input.hidePreviews ? 'card previews hidden' : 'card previews visible',
    input.privateNotifications ? 'notification details hidden' : 'notification details allowed',
  ].join(' · ');
  return { enabledCount, totalCount: 3, label, detail };
}

export function formatPrivacyAutoLockPolicy(minutes: number | null, lockEnabled: boolean): string {
  if (!lockEnabled) return 'Auto-lock becomes available after privacy lock is enabled.';
  if (minutes === null) return 'Automatic locking while hidden is disabled.';
  if (minutes === 0) return 'Locks immediately when Notes becomes hidden.';
  return `Locks after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} hidden.`;
}

export function privacyModeMenuLabel(hidePreviews: boolean): string {
  return hidePreviews ? 'Show note previews' : 'Hide note previews';
}
