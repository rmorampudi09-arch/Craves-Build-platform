import { createHash } from "node:crypto";
import { parseSessionExchange, type CravesSessionExchange } from "./auth-contract";
import { refreshFailure, type RefreshFailure } from "./refresh-policy";

type Result = { session: CravesSessionExchange } | { failure: RefreshFailure };
const pending = new Map<string, { expires: number; result: Promise<Result> }>();

// Bounded server memory only. Cookie hashes are keys; credentials are never logged or persisted.
// Coalesces copies of the same receipt and old cookie; different receipts still reach replay detection.
export async function renewServerSession(base: string, token: string, requestId: string): Promise<Result> {
  const now = Date.now();
  for (const [key, value] of pending) if (value.expires <= now) pending.delete(key);
  const key = createHash("sha256").update(token).digest("hex") + ":" + requestId;
  const existing = pending.get(key);
  if (existing) return existing.result;
  if (pending.size >= 256) return { failure: refreshFailure(503) };
  const result = (async (): Promise<Result> => {
    try {
      const upstream = await fetch(`${base}/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: token, requestId }), cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) return { failure: refreshFailure(upstream.status, upstream.headers.get("retry-after")) };
      const session = parseSessionExchange(await upstream.json().catch(() => null));
      return session ? { session } : { failure: refreshFailure(502) };
    } catch { return { failure: refreshFailure(503) }; }
  })();
  pending.set(key, { expires: now + 20_000, result });
  const value = await result;
  if ("failure" in value && !value.failure.terminal) pending.delete(key);
  return value;
}

export function forgetServerRefresh(token: string): void {
  const prefix = createHash("sha256").update(token).digest("hex") + ":";
  for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
}
