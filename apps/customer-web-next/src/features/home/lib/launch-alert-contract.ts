// Browser-safe: shared by the launch-alerts BFF route and Home's coming-soon page.

/** user-chef keeps up to 160 characters of the area name. */
export const LAUNCH_ALERT_AREA_MAX = 160;

export type LaunchAlertSpot = { latitude: number; longitude: number };
export type LaunchAlertInput = LaunchAlertSpot & { areaName: string };

function coordinate(value: unknown, limit: number): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

/** The spot from `?latitude=&longitude=`, or null when either is missing or out of range. */
export function parseLaunchAlertSpot(latitude: unknown, longitude: unknown): LaunchAlertSpot | null {
  const lat = coordinate(latitude, 90);
  const lng = coordinate(longitude, 180);
  return lat === null || lng === null ? null : { latitude: lat, longitude: lng };
}

/** A Notify me request body: a spot and a non-blank area name, trimmed to the server's limit. */
export function parseLaunchAlertInput(value: unknown): LaunchAlertInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const spot = parseLaunchAlertSpot(raw.latitude, raw.longitude);
  const areaName = typeof raw.areaName === "string" ? raw.areaName.trim().slice(0, LAUNCH_ALERT_AREA_MAX) : "";
  return spot && areaName ? { ...spot, areaName } : null;
}

/** `{ subscribed: boolean }` from user-chef, or null for anything else. */
export function parseLaunchAlertStatus(value: unknown): { subscribed: boolean } | null {
  return value && typeof value === "object" && typeof (value as { subscribed?: unknown }).subscribed === "boolean"
    ? { subscribed: (value as { subscribed: boolean }).subscribed }
    : null;
}

/**
 * "Coming soon to Madhapur", as in the app. A place with no area name falls back to the whole address
 * line, which is too long for a title, so that reads "your area".
 */
export function comingSoonTitle(locationName?: string | null): string {
  const area = locationName?.trim();
  return `Coming soon to ${area && area.length <= 28 && !area.includes(",") ? area : "your area"}`;
}
