import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';

export const CHEF_ORDER_NEAR_REALTIME_BASE_INTERVAL_MS = 30_000;
export const CHEF_ORDER_NEAR_REALTIME_MAX_INTERVAL_MS = 5 * 60_000;
const MAX_FAILURE_BACKOFF_EXPONENT = 4;

export interface ChefOrderNearRealtimeCadenceInput {
  hasIdentity: boolean;
  isAppActive: boolean;
  failureCount: number;
}

export function getChefOrderNearRealtimeIntervalMs({
  hasIdentity,
  isAppActive,
  failureCount,
}: ChefOrderNearRealtimeCadenceInput): number | false {
  if (!hasIdentity || !isAppActive) {
    return false;
  }

  const normalizedFailureCount = Number.isFinite(failureCount)
    ? Math.max(0, Math.floor(failureCount))
    : 0;
  const backoffExponent = Math.min(
    normalizedFailureCount,
    MAX_FAILURE_BACKOFF_EXPONENT,
  );

  return Math.min(
    CHEF_ORDER_NEAR_REALTIME_BASE_INTERVAL_MS * 2 ** backoffExponent,
    CHEF_ORDER_NEAR_REALTIME_MAX_INTERVAL_MS,
  );
}

function parseTimestampMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function selectNewestOrderSnapshot(
  current: ChefOperationalOrder,
  incoming: ChefOperationalOrder,
): ChefOperationalOrder {
  const currentTimestamp = parseTimestampMs(current.updatedAt);
  const incomingTimestamp = parseTimestampMs(incoming.updatedAt);

  if (currentTimestamp !== null && incomingTimestamp !== null) {
    if (incomingTimestamp > currentTimestamp) {
      return incoming;
    }
    if (incomingTimestamp < currentTimestamp) {
      return current;
    }
    return incoming.status === current.status ? incoming : current;
  }

  if (currentTimestamp !== null) {
    return current;
  }
  if (incomingTimestamp !== null) {
    return incoming;
  }

  return incoming.status === current.status ? incoming : current;
}

/**
 * Reconciles the latest bounded server snapshot against the cache without
 * allowing an older duplicate/status row to regress the visible lifecycle.
 * Orders absent from the incoming authoritative bounded snapshot are dropped.
 */
export function reconcileChefOperationalOrderSnapshots(
  current: readonly ChefOperationalOrder[],
  incoming: readonly ChefOperationalOrder[],
): ChefOperationalOrder[] {
  const currentById = new Map<string, ChefOperationalOrder>();
  for (const order of current) {
    const existing = currentById.get(order.id);
    currentById.set(
      order.id,
      existing ? selectNewestOrderSnapshot(existing, order) : order,
    );
  }

  const nextById = new Map<string, ChefOperationalOrder>();
  for (const order of incoming) {
    const existingIncoming = nextById.get(order.id);
    const cached = currentById.get(order.id);
    const baseline = existingIncoming ?? cached;
    nextById.set(
      order.id,
      baseline ? selectNewestOrderSnapshot(baseline, order) : order,
    );
  }

  return Array.from(nextById.values());
}
