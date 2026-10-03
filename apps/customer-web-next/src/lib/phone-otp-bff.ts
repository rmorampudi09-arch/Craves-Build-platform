import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "./bff-request-limits";
import { boundedFetch } from "./bounded-fetch";
import { apiBaseUrl } from "./server-api";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
const CHALLENGE_ID = /^[A-Za-z0-9_-]{43}$/;
const SAFE_ERRORS = new Set([
  "OTP_INVALID", "OTP_RESTART", "OTP_EXPIRED", "OTP_BUSY", "OTP_COOLDOWN",
  "OTP_RATE_LIMIT", "OTP_RESEND_LIMIT", "IDENTITY_INACTIVE", "PHONE_IDENTITY_MISMATCH",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Restores the existing central MSG91 challenge contract without changing identity or session creation. */
export async function centralOtpProxy(request: NextRequest, action: "send" | "verify"): Promise<NextResponse> {
  if (process.env.CRAVES_CENTRAL_OTP_ENABLED !== "true") {
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const bounded = await boundBffRequest(request, { maxBytes: 1024 });
  if (bounded instanceof NextResponse) return bounded;
  const input = record(await bounded.json().catch(() => null));
  const valid = input && (action === "send"
    ? typeof input.phoneNumber === "string" && /^[6-9]\d{9}$/.test(input.phoneNumber)
      && input.countryCode === "91" && (input.challengeId === undefined
        || (typeof input.challengeId === "string" && CHALLENGE_ID.test(input.challengeId)))
    : typeof input.challengeId === "string" && CHALLENGE_ID.test(input.challengeId)
      && typeof input.otp === "string" && /^\d{6}$/.test(input.otp));
  if (!input || !valid) {
    return NextResponse.json({ code: "OTP_INVALID" }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const payload = action === "send"
    ? { phoneNumber: input.phoneNumber, countryCode: "91", ...(input.challengeId ? { challengeId: input.challengeId } : {}) }
    : { challengeId: input.challengeId, otp: input.otp };
  try {
    const response = await boundedFetch(`${apiBaseUrl()}/auth/otp/${action}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    }, 15_000, 24_000);
    const body = record(await response.json().catch(() => null));
    if (!response.ok) {
      const code = typeof body?.code === "string" && SAFE_ERRORS.has(body.code) ? body.code : "OTP_UNAVAILABLE";
      return NextResponse.json({ code }, {
        status: response.status >= 400 && response.status < 600 ? response.status : 503,
        headers: PRIVATE_HEADERS,
      });
    }
    if (action === "send" && typeof body?.challengeId === "string" && CHALLENGE_ID.test(body.challengeId)
      && typeof body.expiresAt === "number" && Number.isSafeInteger(body.expiresAt)
      && typeof body.resendAvailableAt === "number" && Number.isSafeInteger(body.resendAvailableAt)) {
      return NextResponse.json({ challengeId: body.challengeId, expiresAt: body.expiresAt,
        resendAvailableAt: body.resendAvailableAt }, { headers: PRIVATE_HEADERS });
    }
    if (action === "verify" && typeof body?.firebaseCustomToken === "string"
      && body.firebaseCustomToken.length >= 100 && body.firebaseCustomToken.length <= 20_000) {
      return NextResponse.json({ firebaseCustomToken: body.firebaseCustomToken }, { headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 502, headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
