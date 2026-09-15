const inFlightRequests = new Map<string, Promise<unknown>>();

function normalizeDedupeKey(key?: string): string | undefined {
  const normalized = key?.trim();
  return normalized ? normalized : undefined;
}

export function runDedupedRequest<T>(
  key: string | undefined,
  request: () => Promise<T>,
): Promise<T> {
  const normalizedKey = normalizeDedupeKey(key);
  if (!normalizedKey) {
    return request();
  }

  const existing = inFlightRequests.get(normalizedKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = request().finally(() => {
    if (inFlightRequests.get(normalizedKey) === pending) {
      inFlightRequests.delete(normalizedKey);
    }
  });
  inFlightRequests.set(normalizedKey, pending);
  return pending;
}

export function clearInFlightRequestDedupe(): void {
  inFlightRequests.clear();
}
