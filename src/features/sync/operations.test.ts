import { describe, expect, it, vi } from 'vitest';

import {
  classifyOperationalStatus,
  isRetryableReadStatus,
  runSafeReadWithRetry,
} from './operations';

describe('A7 operations helpers', () => {
  it('distinguishes network, auth, authorization, rate-limit and service failures', () => {
    expect(classifyOperationalStatus(0)).toBe('network');
    expect(classifyOperationalStatus(401)).toBe('authentication');
    expect(classifyOperationalStatus(403)).toBe('authorization');
    expect(classifyOperationalStatus(429)).toBe('rate_limit');
    expect(classifyOperationalStatus(503)).toBe('service');
    expect(classifyOperationalStatus(422)).toBe('request');
  });

  it('never treats authentication/authorization failures as retryable reads', () => {
    expect(isRetryableReadStatus(401)).toBe(false);
    expect(isRetryableReadStatus(403)).toBe(false);
    expect(isRetryableReadStatus(422)).toBe(false);
    expect(isRetryableReadStatus(0)).toBe(true);
    expect(isRetryableReadStatus(429)).toBe(true);
    expect(isRetryableReadStatus(503)).toBe(true);
  });

  it('bounds retries for transient reads', async () => {
    const operation = vi
      .fn()
      .mockResolvedValueOnce({ value: 'first', status: 503 })
      .mockResolvedValueOnce({ value: 'second', status: 503 })
      .mockResolvedValueOnce({ value: 'ok', status: 200 });

    const result = await runSafeReadWithRetry(operation, {
      attempts: 3,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    expect(operation).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ value: 'ok', status: 200, attemptsUsed: 3 });
  });

  it('does not retry an authorization failure', async () => {
    const operation = vi.fn().mockResolvedValue({ value: 'denied', status: 403 });
    const result = await runSafeReadWithRetry(operation, {
      attempts: 3,
      baseDelayMs: 0,
      sleep: async () => {},
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(403);
  });
});
