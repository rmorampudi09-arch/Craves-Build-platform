import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { isSameOrigin } from "@/shared/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/**
 * The EMAIL switch from notification-service preferences: the list (GET) or the saved row (PUT).
 * A channel the person never changed has no row and is on, as in the app. Null for any other answer.
 */
function emailEnabled(body: unknown): boolean | null {
  const rows: unknown[] = Array.isArray(body) ? body : [body];
  const row = rows.find((entry) => (entry as { channel?: unknown } | null)?.channel === "EMAIL") as
    | { enabled?: unknown }
    | undefined;
  if (!row) return Array.isArray(body) ? true : null;
  return typeof row.enabled === "boolean" ? row.enabled : null;
}

async function call(request: NextRequest, path: string, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, path, init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // Until the gateway routes these, its 404 reads as Coming soon on the page.
      const mapped = upstreamFailure(upstream.status, body, "NOTIFICATION_PREFERENCES_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const enabled = emailEnabled(body);
    return enabled === null
      ? failure(502, "INVALID_NOTIFICATION_PREFERENCES_RESPONSE")
      : NextResponse.json({ enabled }, { headers });
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "NOTIFICATION_PREFERENCES_UNAVAILABLE");
  }
}

/** Chef Preferences → Email · Statements and updates (app 1.35). */
export async function GET(request: NextRequest) {
  return call(request, "/notifications/preferences");
}

export async function PUT(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const input: unknown = await bounded.json().catch(() => null);
  const enabled = input && typeof input === "object" ? (input as { enabled?: unknown }).enabled : undefined;
  if (typeof enabled !== "boolean") return failure(400, "INVALID_NOTIFICATION_PREFERENCE");
  return call(bounded, "/notifications/preferences/EMAIL", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}
