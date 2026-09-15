import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function integer(value: string | null, fallback: number, min: number, max: number): number | null {
  const parsed = value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function badRequest(message: string) {
  return NextResponse.json(
    { code: "INVALID_DELIVERY_HISTORY_FILTER", message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams;
  const hours = integer(source.get("hours"), 24, 0, 720);
  const limit = integer(source.get("limit"), 30, 5, 100);
  const offset = integer(source.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const attentionOffset = integer(source.get("attentionOffset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = (source.get("sort") ?? "desc").toLowerCase();
  const from = source.get("from");
  const to = source.get("to");

  if (hours === null) return badRequest("hours must be an integer between 0 and 720");
  if (limit === null) return badRequest("limit must be an integer between 5 and 100");
  if (offset === null || attentionOffset === null) return badRequest("pagination offsets must be non-negative integers");
  if (sort !== "asc" && sort !== "desc") return badRequest("sort must be asc or desc");
  if ((from === null) !== (to === null)) return badRequest("from and to must be supplied together");
  if (hours > 0 && (from !== null || to !== null)) return badRequest("from/to are only supported when hours=0");
  if (from !== null && (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to!)))) {
    return badRequest("from and to must be ISO-8601 date-times");
  }
  if (from !== null && Date.parse(from) >= Date.parse(to!)) return badRequest("from must be before to");

  const upstreamQuery = new URLSearchParams({
    hours: String(hours),
    limit: String(limit),
    sort,
    offset: String(offset),
    attentionOffset: String(attentionOffset),
  });
  if (from !== null && to !== null) {
    upstreamQuery.set("from", from);
    upstreamQuery.set("to", to);
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/admin/operations/delivery-intelligence/overview?${upstreamQuery.toString()}`,
      {},
      12_000,
    );
    const body = await upstream.json().catch(() => ({ code: "INVALID_UPSTREAM_RESPONSE" }));
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SessionRequiredError) {
      return NextResponse.json(
        { code: "AUTHENTICATION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { code: "DELIVERY_INTELLIGENCE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
