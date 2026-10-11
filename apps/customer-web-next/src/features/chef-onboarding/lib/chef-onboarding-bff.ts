import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "../../../shared/lib/server-api";
import { boundBffRequest } from "../../../shared/lib/bff-request-limits";
import { onboardingRoute } from "./chef-onboarding-route-policy";
import { isSameOrigin } from "../../../shared/lib/request-security";
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export async function onboardingBff(request: NextRequest, path: string[], admin: boolean) {
  const target = onboardingRoute(request.method, path, admin);
  if (!target)
    return NextResponse.json(
      { code: "UNKNOWN_ONBOARDING_OPERATION" },
      { status: 404, headers: privateHeaders },
    );
  let body: string | undefined;
  if (request.method !== "GET") {
    if (!isSameOrigin(request))
      return NextResponse.json(
        { code: "ORIGIN_REJECTED" },
        { status: 403, headers: privateHeaders },
      );
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      return NextResponse.json({ code: "JSON_REQUIRED" }, { status: 415, headers: privateHeaders });
    const bounded = await boundBffRequest(request);
    if (bounded instanceof NextResponse) return bounded;
    request = bounded;
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return NextResponse.json(
        { code: "INVALID_REQUEST_BODY" },
        { status: 400, headers: privateHeaders },
      );
    body = JSON.stringify(input);
  }
  const query = new URLSearchParams();
  if (request.method === "GET" && path.join("/") === "content" && !admin) {
    const language = request.nextUrl.searchParams.get("language") ?? "en";
    if (!/^[a-z]{2,3}$/.test(language))
      return NextResponse.json(
        { code: "LANGUAGE_INVALID" },
        { status: 400, headers: privateHeaders },
      );
    query.set("language", language);
  }
  if (admin && path.join("/") === "help") {
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor) {
      if (cursor.length > 120)
        return NextResponse.json(
          { code: "HELP_CURSOR_INVALID" },
          { status: 400, headers: privateHeaders },
        );
      query.set("cursor", cursor);
    }
  }
  try {
    const upstream = await authenticatedApiFetch(
      request,
      target + (query.size ? "?" + query.toString() : ""),
      {
        method: request.method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body,
      },
      30000,
      8 * 1024 * 1024,
    );
    const raw: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const code =
        typeof value.code === "string" && /^[A-Z0-9_]{3,80}$/.test(value.code)
          ? value.code
          : "ONBOARDING_UNAVAILABLE";
      const message =
        upstream.status < 500 && typeof value.message === "string"
          ? value.message.slice(0, 500)
          : "Chef onboarding is temporarily unavailable. Your saved progress is preserved.";
      const status = [400, 401, 403, 404, 409, 413, 429].includes(upstream.status)
        ? upstream.status
        : 503;
      return NextResponse.json({ code, message }, { status, headers: privateHeaders });
    }
    if (!raw || typeof raw !== "object")
      return NextResponse.json(
        { code: "INVALID_ONBOARDING_RESPONSE" },
        { status: 502, headers: privateHeaders },
      );
    return NextResponse.json(raw, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json(
      {
        code:
          error instanceof SessionRequiredError
            ? "AUTHENTICATION_REQUIRED"
            : "ONBOARDING_UNAVAILABLE",
        message:
          error instanceof SessionRequiredError
            ? "Sign in to continue your Chef application."
            : "Chef onboarding is temporarily unavailable. Please retry.",
      },
      { status: error instanceof SessionRequiredError ? 401 : 503, headers: privateHeaders },
    );
  }
}
