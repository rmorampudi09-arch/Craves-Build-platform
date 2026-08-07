export const queryPolicy = {
  staleTimeMs: 30_000,
  gcTimeMs: 10 * 60_000,
  readRetryCount: 1,
  mutationRetryCount: 0,
  paging: {
    defaultPageSize: 20,
    maxPageSize: 50,
    maxCachedPages: 8,
  },
} as const;

export function clampPageSize(requestedPageSize?: number): number {
  if (requestedPageSize === undefined || !Number.isFinite(requestedPageSize)) {
    return queryPolicy.paging.defaultPageSize;
  }

  return Math.min(
    queryPolicy.paging.maxPageSize,
    Math.max(1, Math.floor(requestedPageSize)),
  );
}
