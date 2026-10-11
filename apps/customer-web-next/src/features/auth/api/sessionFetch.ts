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

/** A signed-in request failed because the sign-in itself ended (its refresh was refused). */
export const SESSION_ENDED_EVENT = "craves:session-ended";
/** Sent just before "Sign in again" leaves the page, so open forms can keep what was typed. */
export const BEFORE_SIGN_IN_EVENT = "craves:before-sign-in";

export async function refreshSessionCookies(): Promise<boolean> {
  return (await refreshSession()) === "refreshed";
}

// A chef approved after this access token was signed still carries the old roles, and a refresh
// re-reads them. At most once a minute, so an account without the role never rotates on every poll.
const ROLE_REFRESH_GAP_MS = 60_000;
let lastRoleRefresh = 0;

async function lacksFreshChefRole(input: RequestInfo | URL, response: Response): Promise<boolean> {
  if (response.status !== 403 || Date.now() - lastRoleRefresh < ROLE_REFRESH_GAP_MS) return false;
  const url = input instanceof Request ? input.url : String(input);
  if (!new URL(url, "http://same-origin.invalid").pathname.startsWith("/api/chef/")) return false;
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null;
  return body?.code === "CHEF_ACCESS_REQUIRED";
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
  if (await lacksFreshChefRole(input, response)) {
    lastRoleRefresh = Date.now();
    return (await refreshSession()) === "refreshed" ? fetch(input, requestInit) : response;
  }
  if (response.status !== 401 || String(input) === "/api/auth/refresh") {
    return response;
  }

  const refreshResult = await refreshSession();
  if (refreshResult === "refreshed") {
    response = await fetch(input, requestInit);
    return response;
  }

  // Guests get this too; the prompt only shows for someone who was signed in.
  if (refreshResult === "rejected" && typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_ENDED_EVENT));

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
