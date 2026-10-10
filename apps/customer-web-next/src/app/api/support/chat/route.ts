import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boundBffRequest } from "@/lib/bff-request-limits";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const chatRequest = z.object({
  contextRole: z.enum(["CUSTOMER", "CHEF"]),
  orderId: z.string().uuid().optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000),
  }).strict()).min(1).max(20).refine(messages => messages.at(-1)?.role === "user"),
}).strict();

function failure(status: number, code: string) {
  return NextResponse.json({ code }, { status, headers });
}

// Message contents are customer-private: never log the request or upstream body here.
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  const input = chatRequest.safeParse(await bounded.json().catch(() => null));
  if (!input.success) return failure(400, "SUPPORT_CHAT_INVALID");
  try {
    const upstream = await authenticatedApiFetch(bounded, "/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Set here, not by the browser: tells the assistant to give website navigation.
      body: JSON.stringify({ ...input.data, channel: "WEB" }),
    }, 40_000);
    const body: unknown = await upstream.json().catch(() => null);
    const response = body && typeof body === "object"
      ? NextResponse.json(body, { status: upstream.status, headers })
      : failure(upstream.ok ? 502 : upstream.status, "SUPPORT_CHAT_UNAVAILABLE");
    const retryAfter = upstream.status === 429 && upstream.headers.get("Retry-After");
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  } catch (error) {
    return error instanceof SessionRequiredError
      ? failure(401, "AUTHENTICATION_REQUIRED")
      : failure(503, "SUPPORT_CHAT_UNAVAILABLE");
  }
}
