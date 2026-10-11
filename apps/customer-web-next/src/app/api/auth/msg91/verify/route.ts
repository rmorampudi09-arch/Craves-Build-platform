import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { boundedFetch } from "@/shared/lib/bounded-fetch";
import { apiBaseUrl } from "@/shared/lib/server-api";

const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: NextRequest) {
  if (process.env.CRAVES_OTP_PROVIDER !== "msg91")
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  const bounded = await boundBffRequest(request, { maxBytes: 24000 });
  if (bounded instanceof NextResponse) return bounded;
  const input = await bounded.json().catch(() => null) as { accessToken?: unknown } | null;
  const accessToken = input?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length < 40 || accessToken.length > 20000)
    return NextResponse.json({ code: "OTP_INVALID" }, { status: 400, headers });
  try {
    const response = await boundedFetch(`${apiBaseUrl()}/auth/msg91/verify`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ accessToken }),
    }, 12000, 24000);
    const body = await response.json().catch(() => null) as { firebaseCustomToken?: unknown } | null;
    if (!response.ok)
      return NextResponse.json({ code: "OTP_VERIFICATION_FAILED" }, { status: response.status, headers });
    if (typeof body?.firebaseCustomToken !== "string" || body.firebaseCustomToken.length < 100 || body.firebaseCustomToken.length > 20000)
      return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 502, headers });
    return NextResponse.json({ firebaseCustomToken: body.firebaseCustomToken }, { headers });
  } catch {
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  }
}
