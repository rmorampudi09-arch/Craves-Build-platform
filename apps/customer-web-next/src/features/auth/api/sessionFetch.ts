"use client";

type RefreshResult = "refreshed" | "rejected" | "unavailable";

let refreshInFlight: Promise<RefreshResult> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function refreshSession(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;

  const pending = (async (): Promise<RefreshResult> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      }).catch(() => null);

      if (response?.ok) return "refreshed";
      if (
        response &&
        (response.status === 400 ||
          response.status === 401 ||
          response.status === 403)
      ) {
        return "rejected";
      }

      if (attempt === 0) await delay(250);
    }

    return "unavailable";
  })().finally(() => {
    refreshInFlight = null;
  });

  refreshInFlight = pending;
  return pending;
}

export async function refreshSessionCookies(): Promise<boolean> {
  return (await refreshSession()) === "refreshed";
}

/**
 * Same-origin client fetch for authenticated BFF routes.
 * If the short-lived access cookie expires, all concurrent requests share one
 * refresh. A temporary refresh/network outage is surfaced as 503 instead of a
 * false 401 so customer screens do not accidentally treat a brief outage as a
 * sign-out.
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

  const refreshResult = await refreshSession();
  if (refreshResult === "refreshed") {
    response = await fetch(input, requestInit);
    return response;
  }

  if (refreshResult === "unavailable") {
    return new Response(
      JSON.stringify({
        message:
          "Craves is reconnecting your session. Please try again in a moment.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return response;
}
