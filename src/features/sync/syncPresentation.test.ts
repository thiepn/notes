import { describe, expect, it } from 'vitest';

import { formatSyncActivity, syncAttentionCopy } from './syncPresentation';

const baseResult = {
  uploaded: 0,
  downloaded: 0,
  deletedRemote: 0,
  deletedLocal: 0,
  conflicts: 0,
  conflictCopies: 0,
  failed: 0,
  deferred: 0,
};

describe('sync presentation', () => {
  it('summarizes meaningful sync activity without empty counters', () => {
    expect(
      formatSyncActivity({
        ...baseResult,
        uploaded: 2,
        downloaded: 1,
        conflicts: 1,
        conflictCopies: 1,
        failed: 2,
        deferred: 1,
      }),
    ).toBe(
      '2 uploaded · 1 downloaded · 1 conflict · 1 safety copy · 2 failed records · 1 pending record',
    );
  });

  it('reports an unchanged sync clearly', () => {
    expect(formatSyncActivity(baseResult)).toBe('No record changes.');
  });

  it('keeps degraded-state copy explicit about local safety and retry', () => {
    expect(syncAttentionCopy('offline', null)).toEqual({
      title: 'Waiting for a connection',
      detail: 'Notes remain saved locally. Sync resumes automatically when this device reconnects.',
      action: 'Check connection',
    });
    expect(syncAttentionCopy('pending', { ...baseResult, deferred: 2 }).detail).toContain(
      '2 records are still pending',
    );
    expect(syncAttentionCopy('error', { ...baseResult, failed: 1 }).detail).toContain(
      '1 record could not sync',
    );
  });
});
