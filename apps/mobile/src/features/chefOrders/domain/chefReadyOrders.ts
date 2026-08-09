export interface ChefReadyOrderAge {
  elapsedMs: number;
  label: string;
}

export function deriveChefReadyOrderAge(
  updatedAt: string | null | undefined,
  nowMs: number,
): ChefReadyOrderAge | null {
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
    return {elapsedMs, label: 'Updated just now'};
  }
  if (elapsedMinutes < 60) {
    return {
      elapsedMs,
      label: `Updated ${elapsedMinutes} min ago`,
    };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return {
    elapsedMs,
    label: `Updated ${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`,
  };
}
