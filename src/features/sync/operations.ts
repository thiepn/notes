export type OperationalFailureCategory =
  | 'network'
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'request'
  | 'service'
  | 'unknown';

export function classifyOperationalStatus(status: number): OperationalFailureCategory {
  if (status === 0) return 'network';
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'service';
  if (status >= 400) return 'request';
  return 'unknown';
}

export function isRetryableReadStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createOperationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type OperationalEvent = {
  event: string;
  operationId: string;
  category?: OperationalFailureCategory;
  status?: number;
  attempt?: number;
  durationMs?: number;
};

export function logOperationalEvent(input: OperationalEvent): void {
  const payload = {
    event: input.event,
    operation_id: input.operationId,
    ...(input.category ? { category: input.category } : {}),
    ...(typeof input.status === 'number' ? { http_status: input.status } : {}),
    ...(typeof input.attempt === 'number' ? { attempt: input.attempt } : {}),
    ...(typeof input.durationMs === 'number' ? { duration_ms: input.durationMs } : {}),
  };
  const serialized = JSON.stringify(payload);
  if (input.category && input.category !== 'request') console.warn(serialized);
  else console.info(serialized);
}

export async function runSafeReadWithRetry<T>(
  operation: (attempt: number) => Promise<{ value: T; status: number }>,
  {
    attempts = 3,
    baseDelayMs = 350,
    sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
  }: {
    attempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ value: T; status: number; attemptsUsed: number }> {
  let last: { value: T; status: number } | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await operation(attempt);
    if (!isRetryableReadStatus(last.status) || attempt === attempts) {
      return { ...last, attemptsUsed: attempt };
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  if (!last) throw new Error('Safe read retry received no result.');
  return { ...last, attemptsUsed: attempts };
}
