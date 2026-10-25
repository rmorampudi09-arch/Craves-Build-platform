/** Every tab of this browser shares the sign-in cookies, so only one of them renews the sign-in at a time. */
export const SESSION_REFRESH_LOCK = "craves-session-refresh";

/** Runs `work` while holding the browser-wide refresh lock; browsers without Web Locks just run it. */
export async function withSessionRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks
    ? await navigator.locks.request(SESSION_REFRESH_LOCK, work)
    : await work();
}
