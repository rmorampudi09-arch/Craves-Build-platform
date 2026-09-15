import {toAppApiError} from '../../core/http/apiError';

export const queryStaleTimes = {
  defaultMs: 30_000,
  discoveryMs: 5 * 60_000,
} as const;

export const queryPolicy = {
  staleTimeMs: queryStaleTimes.defaultMs,
  gcTimeMs: 10 * 60_000,
  readRetryCount: 1,
  readRetryBaseDelayMs: 500,
  readRetryMaxDelayMs: 2_000,
  mutationRetryCount: 0,
  paging: {
    defaultPageSize: 20,
    maxPageSize: 50,
    maxCachedPages: 8,
  },
} as const;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= queryPolicy.readRetryCount) {
    return false;
  }

  const normalized = toAppApiError(error);
  return normalized.retriable && !normalized.cancelled;
}

export function getQueryRetryDelayMs(attemptIndex: number): number {
  const boundedAttemptIndex = Math.max(0, Math.floor(attemptIndex));
  return Math.min(
    queryPolicy.readRetryBaseDelayMs * 2 ** boundedAttemptIndex,
    queryPolicy.readRetryMaxDelayMs,
  );
}

export function clampPageSize(requestedPageSize?: number): number {
  if (requestedPageSize === undefined || !Number.isFinite(requestedPageSize)) {
    return queryPolicy.paging.defaultPageSize;
  }

  return Math.min(
    queryPolicy.paging.maxPageSize,
    Math.max(1, Math.floor(requestedPageSize)),
  );
}
