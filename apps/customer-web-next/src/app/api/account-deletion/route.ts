import { NextRequest, NextResponse } from "next/server";
import { isDeletionScope, parseDeletionView } from "@/features/account-deletion/domain/deletion-contract";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

const PATH = "/auth/me/deletion";
const headers = { "Cache-Control": "private, no-store" };
function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function forward(request: NextRequest, init?: RequestInit) {
  try {
    const upstream = await authenticatedApiFetch(request, PATH, init);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const mapped = upstreamFailure(upstream.status, body, "ACCOUNT_DELETION_FAILED");
      // "No request yet" is the normal state of a GET, not an error.
      if (request.method === "GET" && upstream.status === 404 && mapped.code === "NO_DELETION_REQUEST") {
        return NextResponse.json({ none: true }, { headers });
      }
      return failure(mapped.status, mapped.code);
    }
    const view = parseDeletionView(body);
    return view
      ? NextResponse.json(view, { status: upstream.status, headers })
      : failure(502, "INVALID_DELETION_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "SESSION_EXPIRED")
      : failure(503, "ACCOUNT_DELETION_UNAVAILABLE");
  }
}

/** The person's current deletion request, or { none: true } when they have not made one. */
export async function GET(request: NextRequest) {
  return forward(request);
}

/** Ask to delete the account. The scope comes from the person; "via" is always WEB, whatever the client sends. */
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request, { maxBytes: 2048 });
  if (bounded instanceof NextResponse) return bounded;
  const input: unknown = await bounded.json().catch(() => null);
  const scope = input && typeof input === "object" ? (input as { scope?: unknown }).scope : undefined;
  if (!isDeletionScope(scope)) return failure(400, "INVALID_DELETION_SCOPE");
  return forward(bounded, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, via: "WEB" }),
  });
}

/** Cancel the request while it is still cancellable. */
export async function DELETE(request: NextRequest) {
  const bounded = await boundBffRequest(request, { maxBytes: 2048 });
  if (bounded instanceof NextResponse) return bounded;
  return forward(bounded, { method: "DELETE" });
}
