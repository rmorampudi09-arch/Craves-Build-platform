/** Academy has its own APIM /academy API; the established API base ends in /api/v1. */
export function apiTarget(base: string, path: string): string {
  return path.startsWith("/academy/") ? new URL(path, base).toString() : `${base}${path}`;
}
