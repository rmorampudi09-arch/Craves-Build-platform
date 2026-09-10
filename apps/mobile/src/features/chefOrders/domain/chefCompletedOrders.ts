export interface ChefCompletedOrderUpdateAge {
  elapsedMs: number;
  label: string;
}

/**
 * The current Chef order contract does not expose a dedicated deliveredAt field.
 * Completed history therefore labels updatedAt honestly as server update age.
 */
export function deriveChefCompletedOrderUpdateAge(
  updatedAt: string | null | undefined,
  nowMs: number,
): ChefCompletedOrderUpdateAge | null {
  if (!updatedAt || !Number.isFinite(nowMs)) {
    return null;
  }

  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, nowMs - updatedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);

  if (elapsedMinutes < 1) {
    return {elapsedMs, label: 'Server updated just now'};
  }
  if (elapsedMinutes < 60) {
    return {
      elapsedMs,
      label: `Server updated ${elapsedMinutes} min ago`,
    };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return {
      elapsedMs,
      label: `Server updated ${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`,
    };
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return {
    elapsedMs,
    label: `Server updated ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`,
  };
}
