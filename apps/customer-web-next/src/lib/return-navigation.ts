const RETURN_ROUTE_PREFIX = "craves:return-route:";

export type CustomerReturnRoute =
  | "/home"
  | "/profile"
  | `/dish/${string}`
  | `/kitchen/${string}`;

const DETAIL_RETURN_ROUTE =
  /^\/(?:dish|kitchen)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(destination: string): string {
  return `${RETURN_ROUTE_PREFIX}${destination}`;
}

export function toCustomerReturnRoute(
  value: string,
  fallback: CustomerReturnRoute = "/home",
): CustomerReturnRoute {
  if (value === "/home" || value === "/profile") return value;
  return DETAIL_RETURN_ROUTE.test(value)
    ? (value as CustomerReturnRoute)
    : fallback;
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

  return saved ? toCustomerReturnRoute(saved, fallback) : fallback;
}
