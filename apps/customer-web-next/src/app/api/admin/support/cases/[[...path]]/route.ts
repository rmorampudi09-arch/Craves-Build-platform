import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
const headers = { "Cache-Control": "no-store" };
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"] as const;
const POST_BODIES: Record<string, z.ZodTypeAny> = {
  messages: z.object({ message: z.string().trim().min(1).max(5000), internalNote: z.boolean() }).strict(),
  "assign-to-me": z.null(),
};
const PATCH_BODIES: Record<string, z.ZodTypeAny> = {
  status: z.object({ status: z.enum(STATUSES), note: z.string().trim().max(500).optional() }).strict(),
};

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

async function forward(request: NextRequest, path: string, init: RequestInit = {}) {
  try {
    const upstream = await authenticatedApiFetch(request, `/admin/support/cases${path}`, init, 15_000);
    const body: unknown = await upstream.json().catch(() => null);
    const value = body && typeof body === "object" ? body as Record<string, unknown> : null;
    if (!upstream.ok) {
      const code = typeof value?.code === "string" && /^[A-Z0-9_]{3,80}$/.test(value.code) ? value.code : "SUPPORT_CASE_FAILED";
      const message = upstream.status < 500 && typeof value?.message === "string" ? value.message.slice(0, 500) : undefined;
      const status = [400, 401, 403, 404, 409, 429].includes(upstream.status) ? upstream.status : 503;
      return NextResponse.json({ code, message }, { status, headers });
    }
    return value ? NextResponse.json(value, { headers }) : failure(502, "INVALID_SUPPORT_CASE_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "AUTHENTICATION_REQUIRED")
      : failure(503, "SUPPORT_CASE_UNAVAILABLE");
  }
}

export async function GET(request: NextRequest, context: Context) {
  const path = (await context.params).path ?? [];
  if (path.length === 1) return isUuid(path[0]) ? forward(request, `/${path[0]}`) : failure(400, "INVALID_SUPPORT_CASE_ID");
  if (path.length) return failure(404, "UNKNOWN_SUPPORT_OPERATION");
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const cursor = params.get("cursor");
  if ((status && !STATUSES.includes(status as (typeof STATUSES)[number])) || (cursor && cursor.length > 512)) {
    return failure(400, "INVALID_SUPPORT_CASE_QUERY");
  }
  const query = new URLSearchParams({ limit: "50", assignedToMe: String(params.get("assignedToMe") === "true") });
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return forward(request, `?${query}`);
}

async function write(request: NextRequest, context: Context, bodies: Record<string, z.ZodTypeAny>) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  const [caseId, action, ...extra] = (await context.params).path ?? [];
  if (!caseId || !isUuid(caseId)) return failure(400, "INVALID_SUPPORT_CASE_ID");
  if (!action || extra.length || !Object.hasOwn(bodies, action)) return failure(404, "UNKNOWN_SUPPORT_OPERATION");
  const input = bodies[action].safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "INVALID_SUPPORT_CASE_REQUEST");
  return forward(bounded, `/${caseId}/${action}`, input.data === null ? { method: request.method } : {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
  });
}

export function POST(request: NextRequest, context: Context) {
  return write(request, context, POST_BODIES);
}

export function PATCH(request: NextRequest, context: Context) {
  return write(request, context, PATCH_BODIES);
}
