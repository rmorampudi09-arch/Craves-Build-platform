import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { publicApiFetch } from "@/shared/lib/public-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const guestRequest = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000),
  }).strict()).min(1).max(20).refine(messages => messages.at(-1)?.role === "user"),
}).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

/**
 * The backend limits each visitor by this key. Front Door sets X-Azure-ClientIP itself; the raw address
 * never leaves the web server, only its hash does, and it is kept in memory only.
 */
function visitorKey(request: NextRequest): string {
  const ip = request.headers.get("x-azure-clientip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return createHash("sha256").update(`craves-support-guest:${ip}`).digest("hex");
}

// Support chat for visitors who are not signed in: general and sign-in help, plus a callback request.
// Message contents are private: never log the request or upstream body here.
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  const input = guestRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "SUPPORT_CHAT_INVALID");
  try {
    const upstream = await publicApiFetch("/support/chat/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Craves-Visitor": visitorKey(bounded) },
      body: JSON.stringify({ ...input.data, channel: "WEB" }),
    }, 40_000);
    const body: unknown = await upstream.json().catch(() => null);
    const response = body && typeof body === "object"
      ? NextResponse.json(body, { status: upstream.status, headers })
      : failure(upstream.ok ? 502 : upstream.status, "SUPPORT_CHAT_UNAVAILABLE");
    const retryAfter = upstream.status === 429 && upstream.headers.get("Retry-After");
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  } catch {
    return failure(503, "SUPPORT_CHAT_UNAVAILABLE");
  }
}
