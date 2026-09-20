"use client";

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Same-origin client fetch for authenticated BFF routes.
 * If the short-lived access cookie has expired but the refresh cookie is still
 * valid, renew once and replay the original request.
 */
export async function sessionFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const requestInit: RequestInit = {
    ...init,
    credentials: init.credentials ?? "same-origin",
  };

  let response = await fetch(input, requestInit);
  if (response.status !== 401 || String(input) === "/api/auth/refresh") {
    return response;
  }

  if (!(await refreshSession())) return response;
  response = await fetch(input, requestInit);
  return response;
}
