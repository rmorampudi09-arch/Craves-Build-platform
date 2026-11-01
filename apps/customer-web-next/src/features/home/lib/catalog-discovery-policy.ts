// Matches the app: customers only see kitchens within 10 km.
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
      `Discovery radius must be a whole number between 1 and ${MAX_DISCOVERY_RADIUS_METERS} metres.`,
    );
  }

  return [requestedRadiusMeters];
}
