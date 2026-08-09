export interface ChefNewOrderReceivedAge {
  elapsedMinutes: number | null;
  label: string;
}

/**
 * Derives display-only received age from the authoritative server timestamp.
 * It never guesses the hidden acceptance-expiry timestamp or increments a local timer.
 */
export function deriveChefNewOrderReceivedAge(
  createdAt: string | null | undefined,
  nowMs: number,
): ChefNewOrderReceivedAge {
  if (!createdAt || !Number.isFinite(nowMs)) {
    return {elapsedMinutes: null, label: 'Received time unavailable'};
  }

  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) {
    return {elapsedMinutes: null, label: 'Received time unavailable'};
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - createdMs) / 60_000));
  if (elapsedMinutes < 1) {
    return {elapsedMinutes, label: 'Received just now'};
  }
  if (elapsedMinutes < 60) {
    return {elapsedMinutes, label: `Received ${elapsedMinutes} min ago`};
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const remainingMinutes = elapsedMinutes % 60;
  const hourLabel = `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  return {
    elapsedMinutes,
    label:
      remainingMinutes === 0
        ? `Received ${hourLabel} ago`
        : `Received ${hourLabel} ${remainingMinutes} min ago`,
  };
}
