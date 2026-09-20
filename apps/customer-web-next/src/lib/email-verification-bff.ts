import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "./bff-request-limits";
import { authenticatedApiFetch, SessionRequiredError } from "./server-api";
import { emailVerificationErrors, emailVerificationRequests, emailVerificationStateSchema, type EmailVerificationAction } from "./email-verification-contract";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" };
const reply = (body: unknown, status: number, retryAfter?: string) => NextResponse.json(body, {
  status, headers: { ...PRIVATE_HEADERS, ...(retryAfter ? { "Retry-After": retryAfter } : {}) },
});

/** Every write is a flat string map. Preserve duplicate-key rejection before JSON normalization. */
function parseRequest(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const pair = /\s*("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*/y;
    const keys = new Set<string>();
    let cursor = text.indexOf("{") + 1;
    while (true) {
      pair.lastIndex = cursor;
      const match = pair.exec(text);
      if (!match) return null;
      const key = JSON.parse(match[1]) as string;
      if (keys.has(key)) return null;
      keys.add(key); cursor = pair.lastIndex;
      if (text[cursor] === "}") return keys.size === Object.keys(value).length ? value : null;
      if (text[cursor] !== ",") return null;
      cursor += 1;
    }
  } catch { return null; }
}

/** Auth determines the owner from the session; identity and destination IDs are never accepted from the caller. */
export async function emailVerificationBff(request: NextRequest, action?: EmailVerificationAction): Promise<NextResponse> {
  if (!request.cookies.get("craves_access_token")?.value) {
    return reply({ code: "AUTHENTICATION_REQUIRED", message: emailVerificationErrors.AUTHENTICATION_REQUIRED.message }, 401);
  }
  let body: string | undefined;
  if (action) {
    const bounded = await boundBffRequest(request, { maxBytes: 4096, timeoutMs: 5000 });
    if (bounded instanceof NextResponse) return bounded;
    request = bounded;
    const parsed = emailVerificationRequests[action].safeParse(parseRequest(await request.text().catch(() => "")));
    if (!parsed.success) return reply({ code: "EMAIL_REQUEST_INVALID", message: emailVerificationErrors.EMAIL_REQUEST_INVALID.message }, 400);
    body = JSON.stringify(parsed.data);
  }
  try {
    const response = await authenticatedApiFetch(request, `/auth/email-verification${action ? `/${action}` : ""}`, {
      method: action ? "POST" : "GET",
      ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}),
    }, 20_000, 64 * 1024);
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const retryAfter = response.status === 429 && retry && /^[1-9]\d{0,4}$/.test(retry) && Number(retry) <= 86400 ? retry : undefined;
      const code = raw && typeof raw === "object" && "code" in raw ? raw.code : null;
      if (typeof code === "string" && Object.hasOwn(emailVerificationErrors, code)) {
        const safe = emailVerificationErrors[code];
        if (response.status === safe.status) return reply({ code, message: safe.message }, safe.status, retryAfter);
      }
      if (response.status === 401) return reply({ code: "AUTHENTICATION_REQUIRED", message: emailVerificationErrors.AUTHENTICATION_REQUIRED.message }, 401);
      // Never echo provider diagnostics, addresses, tokens or submitted codes.
      return reply({ code: "EMAIL_VERIFICATION_UNAVAILABLE" }, response.status === 429 ? 429 : 503, retryAfter);
    }
    const parsed = emailVerificationStateSchema.safeParse(raw);
    const expected = action === "challenges" || action === "resend" ? 202 : 200;
    if (!parsed.success || response.status !== expected) return reply({ code: "EMAIL_VERIFICATION_RESPONSE_INVALID" }, 502);
    return reply(parsed.data, expected);
  } catch (error) {
    return reply({ code: error instanceof SessionRequiredError ? "AUTHENTICATION_REQUIRED" : "EMAIL_VERIFICATION_UNAVAILABLE" }, error instanceof SessionRequiredError ? 401 : 503);
  }
}
