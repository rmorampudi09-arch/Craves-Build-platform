import { captureReferralTouch, referralCookie, verifyReferralTouch } from "./first-touch.server";
import { codeSchema } from "./contracts";

export type InvitationHandlerOptions = {
  enabled: boolean;
  attributionWindowApproved: boolean;
  publicOrigin: string;
  signupPath: string;
  signingKey: Uint8Array;
  // Both callbacks must be read-only, server-owned checks. Never accept client identity headers.
  resolveSession: (request: Request, signal: AbortSignal) => Promise<"anonymous" | "authenticated">;
  resolveActiveCode: (code: string, signal: AbortSignal) => Promise<boolean>;
  nowSeconds?: () => number;
};
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
export class ReferralAttributionError extends Error {
  constructor(readonly code: string) { super(code); }
}
function tokenFrom(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  if (cookie.length > 8192) throw new ReferralAttributionError("REFERRAL_COOKIE_HEADER_TOO_LARGE");
  const matches = cookie.split(";").map(value => value.trim()).filter(value => value.startsWith(referralCookie.name + "="));
  if (matches.length > 1) throw new ReferralAttributionError("REFERRAL_COOKIE_AMBIGUOUS");
  return matches.length === 0 ? null : matches[0].slice(referralCookie.name.length + 1);
}
/** Invoke at the authoritative new-account transaction boundary, not merely at OTP start.
 * A present but invalid token is an explicit error, never a silent unattributed signup.
 * Persist the returned code with the account and its source outbox event in the SAME transaction. */
export function readSignupReferral(request: Request, signingKey: Uint8Array, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (typeof window !== "undefined") throw new Error("Server-only referral attribution");
  const token = tokenFrom(request);
  if (token === null) return null;
  const value = verifyReferralTouch(token, signingKey, nowSeconds);
  if (!value) throw new ReferralAttributionError("REFERRAL_ATTRIBUTION_INVALID");
  return value.code;
}
async function within<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("REFERRAL_LOOKUP_UNAVAILABLE"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(work), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
/** Unmounted Node-runtime handler: no current /r route, signup or session implementation is replaced. */
export function createReferralInvitationHandler(options: InvitationHandlerOptions) {
  if (typeof window !== "undefined") throw new Error("Server-only invitation handler");
  const origin = new URL(options.publicOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("An approved HTTPS public origin is required");
  if (!/^\/[A-Za-z0-9/_-]*$/.test(options.signupPath) || options.signupPath.startsWith("//") || options.signupPath.startsWith("/r/"))
    throw new Error("An explicit local signup path is required");
  const key = options.signingKey.slice();
  const now = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const problem = (status: number, code: string) => Response.json({ code }, { status, headers });
  const redirect = (cookie?: string) => new Response(null, { status: 303, headers: { ...headers, Location: origin.origin + options.signupPath, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
  return async (request: Request): Promise<Response> => {
    if (!options.enabled || !options.attributionWindowApproved) return problem(503, "REFERRAL_ATTRIBUTION_NOT_OPEN");
    if (request.method !== "GET") return problem(405, "METHOD_NOT_ALLOWED");
    const url = new URL(request.url);
    const match = /^\/r\/([2-9A-HJ-NP-Z]{16})$/.exec(url.pathname);
    if (url.origin !== origin.origin || !match || url.search) return problem(404, "INVITATION_NOT_FOUND");
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
    try {
      const session = await within(signal, () => options.resolveSession(request, signal));
      if (session === "authenticated") return redirect(); // Never attach a new parent to an existing account.
      if (session !== "anonymous") return problem(503, "SESSION_VERIFICATION_UNAVAILABLE");
      const prior = tokenFrom(request), at = now();
      const locked = prior === null ? null : verifyReferralTouch(prior, key, at);
      if (prior !== null && !locked) return problem(422, "REFERRAL_ATTRIBUTION_INVALID");
      const code = codeSchema.parse(locked?.code ?? match[1]);
      const active = await within(signal, () => options.resolveActiveCode(code, signal));
      if (active !== true) return problem(404, "INVITATION_NOT_AVAILABLE");
      const touch = captureReferralTouch(prior, code, key, at);
      return redirect(`${referralCookie.name}=${touch.token}; Path=/; Max-Age=${touch.maxAge}; Secure; HttpOnly; SameSite=Lax`);
    } catch (error) {
      return error instanceof ReferralAttributionError ? problem(422, error.code) : problem(503, "REFERRAL_CAPTURE_UNAVAILABLE");
    }
  };
}
