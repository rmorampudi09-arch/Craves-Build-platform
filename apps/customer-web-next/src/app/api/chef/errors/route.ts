import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 300; // per web replica; keeps a broken screen from flooding the logs
let windowStart = 0;
let count = 0;

/** Chef screens report the error a chef saw. Logged as one JSON line for Log Analytics; no personal data. */
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request, { maxBytes: 512, timeoutMs: 2_000 });
  if (bounded instanceof NextResponse) return bounded;
  const raw = (await bounded.json().catch(() => null)) as { screen?: unknown; code?: unknown; status?: unknown } | null;
  const screen = typeof raw?.screen === "string" ? raw.screen : "";
  const code = typeof raw?.code === "string" ? raw.code : "";
  const status = typeof raw?.status === "number" && Number.isInteger(raw.status) && raw.status >= 0 && raw.status < 600 ? raw.status : -1;
  if (!/^\/chef(\/[A-Za-z0-9_-]{1,80}){0,4}\/?$/.test(screen) || !/^[A-Z][A-Z0-9_]{1,80}$/.test(code) || status < 0) {
    return NextResponse.json({ code: "INVALID_CHEF_ERROR_REPORT" }, { status: 400 });
  }
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; count = 0; }
  if (++count <= MAX_PER_WINDOW) {
    // Ids in the path (orders, dishes) become ":id" so the log carries no record ids.
    const page = screen.replace(/\/(?:[0-9a-f]{8}-[0-9a-f-]{27,}|\d+)(?=\/|$)/gi, "/:id");
    console.warn(JSON.stringify({ event: "CHEF_ERROR_SHOWN", screen: page, code, status }));
  }
  return new NextResponse(null, { status: 204 });
}
