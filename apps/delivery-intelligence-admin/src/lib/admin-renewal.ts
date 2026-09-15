export type SessionState = "checking" | "ready" | "reconnecting" | "ended";
type Timing = { accessExpiresAt: number; sessionExpiresAt: number };
type Dependencies = { fetcher: typeof fetch; now: () => number; lock: <T>(work: () => Promise<T>) => Promise<T>; notify: (state: SessionState) => void; receipt?: { get: () => string | null; set: (value: string) => void; clear: () => void } };

export class RenewalError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; this.name = "RenewalError"; }
}

// Owns metadata only. Access/refresh credentials remain in host-only HttpOnly cookies.
export function createAdminRenewal(deps: Dependencies) {
  let timing: Timing | null = null;
  let inflight: Promise<void> | null = null;
  let ended = false;
  let generation = 0;
  let attempt: string | null = null;
  let retryAt = 0;
  const send = (url: string, init: RequestInit = {}) => deps.fetcher(url, {
    ...init, cache: "no-store", credentials: "same-origin", signal: init.signal ?? AbortSignal.timeout(12_000),
  });
  const end = () => { ended = true; generation++; timing = null; deps.notify("ended"); };
  const accept = async (response: Response) => {
    const body = await response.json().catch(() => null);
    const value = body?.timing;
    const serverNow = Number.isFinite(value?.serverTime) ? value.serverTime : deps.now();
    if (!value || !Number.isFinite(value.accessExpiresAt) || !Number.isFinite(value.sessionExpiresAt)
      || value.accessExpiresAt > value.sessionExpiresAt || value.sessionExpiresAt <= serverNow) {
      throw new RenewalError(503, "Session verification is temporarily unavailable.");
    }
    const offset = deps.now() - serverNow;
    timing = { accessExpiresAt: value.accessExpiresAt + offset, sessionExpiresAt: value.sessionExpiresAt + offset };
  };

  const ensure = (force = false): Promise<void> => {
    if (ended) return Promise.reject(new RenewalError(401, "Administrator sign-in is required."));
    // A client clock jump can trigger verification, but only the server can terminate authentication.
    if (timing && timing.sessionExpiresAt <= deps.now()) force = true;
    if (!force && timing && timing.accessExpiresAt - deps.now() > 60_000) return Promise.resolve();
    if (inflight) return inflight;
    const started = generation;
    inflight = deps.lock(async () => {
      if (ended || started !== generation) throw new RenewalError(401, "Administrator sign-in is required.");
      if (retryAt > deps.now()) throw new RenewalError(503, "Reconnecting securely. Please wait a moment.");
      const status = await send("/api/auth/admin-session");
      if (status.ok) {
        await accept(status);
        if (ended || started !== generation) throw new RenewalError(401, "Administrator sign-in is required.");
        if (timing && timing.accessExpiresAt - deps.now() > 60_000) { deps.notify("ready"); return; }
      } else if (status.status !== 401) {
        throw new RenewalError(status.status, "Administrator session verification is unavailable.");
      }
      deps.notify("reconnecting");
      attempt ??= deps.receipt?.get() ?? crypto.randomUUID();
      deps.receipt?.set(attempt);
      const refreshed = await send("/api/auth/refresh", { method: "POST", headers: { "X-Refresh-Request-ID": attempt } });
      if (!refreshed.ok) {
        if (refreshed.status === 429) retryAt = deps.now() + Math.min(300, Number(refreshed.headers.get("retry-after")) || 30) * 1000;
        throw new RenewalError(refreshed.status, "Administrator session renewal is unavailable.");
      }
      // Re-read the shared cookie through the server, validating live roles/revocation after rotation.
      const verified = await send("/api/auth/admin-session");
      if (!verified.ok) throw new RenewalError(verified.status, "Administrator session verification is unavailable.");
      await accept(verified);
      attempt = null;
      deps.receipt?.clear();
      if (ended || started !== generation) throw new RenewalError(401, "Administrator sign-in is required.");
      deps.notify("ready");
    }).catch(error => {
      if (error instanceof RenewalError && (error.status === 401 || error.status === 403)) end();
      else deps.notify("reconnecting");
      throw error instanceof RenewalError ? error : new RenewalError(503, "Reconnecting securely. Your work is kept in this tab.");
    }).finally(() => { inflight = null; });
    return inflight;
  };

  const request: typeof fetch = async (input, init = {}) => {
    try { await ensure(); } catch (error) {
      return Response.json({ code: error instanceof RenewalError && error.status === 401 ? "SESSION_EXPIRED" : "SESSION_RECONNECTING" },
        { status: error instanceof RenewalError ? error.status : 503 });
    }
    const started = generation;
    let result = await deps.fetcher(input, { ...init, credentials: "same-origin", cache: "no-store" });
    if (started !== generation || ended) return Response.json({ code: "SESSION_EXPIRED" }, { status: 401 });
    if (result.status !== 401) return result; // 403 is operation permission, never token renewal.
    try { await ensure(true); } catch (error) {
      return Response.json({ code: "SESSION_RECONNECTING" }, { status: error instanceof RenewalError ? error.status : 503 });
    }
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") return Response.json({ code: "SESSION_RENEWED_RETRY_REQUIRED" }, { status: 409 });
    result = await deps.fetcher(input, { ...init, credentials: "same-origin", cache: "no-store" });
    if (started !== generation || ended || result.status === 401) { end(); return Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }); }
    return result;
  };

  const logout = async () => {
    end();
    return deps.lock(async () => send("/api/auth/logout", { method: "POST" }));
  };
  return { ensure, request, logout, end };
}

const listeners = new Set<(state: SessionState) => void>();
let channel: BroadcastChannel | null = null;
let sharedReceipt: string | null = null;
let client: ReturnType<typeof createAdminRenewal> | null = null;

function instance() {
  if (!client) {
    client = createAdminRenewal({ fetcher: (...args) => fetch(...args), now: Date.now,
      lock: async work => typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request("craves-admin-session", work) : await work(),
      notify: state => { for (const listener of listeners) listener(state); },
      receipt: {
        get: () => sharedReceipt,
        set: value => { sharedReceipt = value; channel?.postMessage({ type: "refresh-receipt", id: value }); },
        clear: () => { sharedReceipt = null; channel?.postMessage({ type: "refresh-receipt", id: null }); },
      },
    });
    if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("craves-admin-session");
      channel.onmessage = event => {
        if (event.data === "signed-out") { sharedReceipt = null; client?.end(); }
        if (event.data?.type === "refresh-receipt" && (event.data.id === null || (typeof event.data.id === "string" && /^[0-9a-f-]{36}$/.test(event.data.id)))) sharedReceipt = event.data.id;
      };
    }
  }
  return client;
}

export const adminFetch: typeof fetch = (input, init) => instance().request(input, init);
export async function logoutAdminSession() {
  channel?.postMessage("signed-out");
  return instance().logout();
}
export function observeAdminSession(listener: (state: SessionState) => void): () => void {
  listeners.add(listener);
  const check = () => { if (document.visibilityState === "visible") void instance().ensure(true).catch(() => undefined); };
  const timer = window.setInterval(check, 30_000);
  window.addEventListener("online", check);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  check();
  return () => { listeners.delete(listener); window.clearInterval(timer); window.removeEventListener("online", check);
    window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
}
