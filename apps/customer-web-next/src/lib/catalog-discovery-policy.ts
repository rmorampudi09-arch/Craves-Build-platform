export const DEFAULT_DISCOVERY_RADIUS_METERS = 10_000;
export const MAX_DISCOVERY_RADIUS_METERS = 10_000;

export function candidateDiscoveryRadii(
  requestedRadiusMeters = DEFAULT_DISCOVERY_RADIUS_METERS,
): number[] {
  if (
    !Number.isInteger(requestedRadiusMeters) ||
    requestedRadiusMeters < 1 ||
    requestedRadiusMeters > MAX_DISCOVERY_RADIUS_METERS
  ) {
    throw new Error(
      "Discovery radius must be a whole number between 1 and 10000 metres.",
    );
  }

  return [requestedRadiusMeters];
}

export function formatDiscoveryRadius(radiusMeters: number): string {
  if (radiusMeters < 1_000) return String(radiusMeters) + " m";
  const kilometres = radiusMeters / 1_000;
  return (
    String(Number.isInteger(kilometres) ? kilometres : kilometres.toFixed(1)) +
    " km"
  );
}
