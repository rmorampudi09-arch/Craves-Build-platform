import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "./bff-request-limits";
import { boundedFetch } from "./bounded-fetch";
import { apiBaseUrl } from "./server-api";

const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
const id = /^[A-Za-z0-9_-]{43}$/;
const safeCodes = new Set(["OTP_INVALID", "OTP_RESTART", "OTP_EXPIRED", "OTP_BUSY", "OTP_COOLDOWN",
  "OTP_RATE_LIMIT", "OTP_RESEND_LIMIT", "IDENTITY_INACTIVE", "PHONE_IDENTITY_MISMATCH"]);

export async function centralOtpProxy(request: NextRequest, action: "send" | "verify") {
  if (process.env.CRAVES_CENTRAL_OTP_ENABLED !== "true")
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  const bounded = await boundBffRequest(request, { maxBytes: 1024 });
  if (bounded instanceof NextResponse) return bounded;
  const input = await bounded.json().catch(() => null) as Record<string, unknown> | null;
  if (!input || (action === "send"
    ? typeof input.phoneNumber !== "string" || !/^[6-9]\d{9}$/.test(input.phoneNumber) || input.countryCode !== "91"
      || (input.challengeId !== undefined && (typeof input.challengeId !== "string" || !id.test(input.challengeId)))
    : typeof input.challengeId !== "string" || !id.test(input.challengeId)
      || typeof input.otp !== "string" || !/^\d{6}$/.test(input.otp)))
    return NextResponse.json({ code: "OTP_INVALID" }, { status: 400, headers });
  const body = action === "send"
    ? { phoneNumber: input.phoneNumber, countryCode: "91", ...(input.challengeId ? { challengeId: input.challengeId } : {}) }
    : { challengeId: input.challengeId, otp: input.otp };
  try {
    const response = await boundedFetch(`${apiBaseUrl()}/auth/otp/${action}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
    }, 15000, 24000);
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof result?.code === "string" && safeCodes.has(result.code) ? result.code : "OTP_UNAVAILABLE";
      return NextResponse.json({ code }, { status: response.status >= 400 && response.status < 600 ? response.status : 503, headers });
    }
    if (action === "send" && typeof result?.challengeId === "string" && id.test(result.challengeId)
      && typeof result.expiresAt === "number" && Number.isSafeInteger(result.expiresAt)
      && typeof result.resendAvailableAt === "number" && Number.isSafeInteger(result.resendAvailableAt))
      return NextResponse.json({ challengeId: result.challengeId, expiresAt: result.expiresAt, resendAvailableAt: result.resendAvailableAt }, { headers });
    if (action === "verify" && typeof result?.firebaseCustomToken === "string"
      && result.firebaseCustomToken.length >= 100 && result.firebaseCustomToken.length <= 20000)
      return NextResponse.json({ firebaseCustomToken: result.firebaseCustomToken }, { headers });
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 502, headers });
  } catch {
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  }
}
