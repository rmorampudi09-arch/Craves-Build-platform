const RETURN_ROUTE_PREFIX = "craves:return-route:";

export type CustomerReturnRoute = "/home" | "/profile";

function storageKey(destination: string): string {
  return `${RETURN_ROUTE_PREFIX}${destination}`;
}

export function rememberReturnRoute(
  destination: string,
  returnTo: CustomerReturnRoute,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKey(destination), returnTo);
}

export function consumeReturnRoute(
  destination: string,
  fallback: CustomerReturnRoute,
): CustomerReturnRoute {
  if (typeof window === "undefined") return fallback;

  const key = storageKey(destination);
  const saved = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);

  return saved === "/home" || saved === "/profile" ? saved : fallback;
}
