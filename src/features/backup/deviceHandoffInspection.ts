export type NativeSavedBackupFinding =
  'not-inspected' | 'validated-local-file' | 'file-clock-invalid';
export function inspectSavedNotesHandoff(input: {
  validated: boolean;
  size: number;
  exportedAt: number | null;
  now: number;
}): { status: NativeSavedBackupFinding; text: string; independentCustody: 'NOT_TESTED' } {
  if (!input.validated || input.size <= 0 || input.exportedAt === null)
    return {
      status: 'not-inspected',
      text: 'Choose an actual saved original Notes JSON backup and validate it before switching devices.',
      independentCustody: 'NOT_TESTED',
    };
  if (
    !Number.isSafeInteger(input.exportedAt) ||
    input.exportedAt < 0 ||
    input.exportedAt > input.now + 300_000
  )
    return {
      status: 'file-clock-invalid',
      text: 'The backup timestamp is invalid or too far ahead of this device. Inspect the original file and clock before switching.',
      independentCustody: 'NOT_TESTED',
    };
  return {
    status: 'validated-local-file',
    text: 'Original BackupRepository validated the selected saved JSON file without importing it. Check that its contents and export date match your intended Notes device. Account ownership, remote retention and independent custody are NOT verified.',
    independentCustody: 'NOT_TESTED',
  };
}
