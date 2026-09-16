import { createHmac, timingSafeEqual } from "node:crypto";
import { codeSchema } from "./contracts";

// This helper never reads/writes cookies itself and never changes an existing account.
// The future signup owner must verify the token, publish account.registered durably,
// and clear the cookie only after account creation has committed.
export const referralCookie = { name: "__Host-craves-referral-first", httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
const MAX_AGE_SECONDS = 30 * 86400; // Proposed pre-signup attribution window; approve before launch.
type Touch = { v: 1; code: string; capturedAt: number; expiresAt: number };
function secret(key: Uint8Array) {
  if (typeof window !== "undefined" || key.byteLength < 32) throw new Error("A server-only signing key of at least 32 bytes is required");
}
function signature(payload: string, key: Uint8Array) { return createHmac("sha256", key).update(payload, "utf8").digest("base64url"); }
export function verifyReferralTouch(token: string | null | undefined, key: Uint8Array, nowSeconds = Math.floor(Date.now() / 1000)): Touch | null {
  secret(key);
  if (!token || token.length > 1024 || !Number.isSafeInteger(nowSeconds)) return null;
  const [payload, supplied, extra] = token.split(".");
  if (extra !== undefined || !payload || !supplied || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return null;
  const expected = signature(payload, key), a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Touch;
    if (value.v !== 1 || !codeSchema.safeParse(value.code).success || !Number.isSafeInteger(value.capturedAt) || !Number.isSafeInteger(value.expiresAt)
      || value.capturedAt > nowSeconds || value.expiresAt <= nowSeconds || value.expiresAt - value.capturedAt !== MAX_AGE_SECONDS) return null;
    return value;
  } catch { return null; }
}
export function captureReferralTouch(existing: string | null | undefined, candidate: string, key: Uint8Array, nowSeconds = Math.floor(Date.now() / 1000)): { token: string; maxAge: number; preserved: boolean } {
  secret(key);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error("Invalid capture time");
  const prior = verifyReferralTouch(existing, key, nowSeconds);
  if (prior && existing) return { token: existing, maxAge: prior.expiresAt - nowSeconds, preserved: true };
  const code = codeSchema.parse(candidate.trim().toUpperCase());
  const value: Touch = { v: 1, code, capturedAt: nowSeconds, expiresAt: nowSeconds + MAX_AGE_SECONDS };
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return { token: `${payload}.${signature(payload, key)}`, maxAge: MAX_AGE_SECONDS, preserved: false };
}
