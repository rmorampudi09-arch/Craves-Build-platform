import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {} }));
import { POST } from "@/app/api/support/chat/route";

const ORDER = "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11";
const valid = { contextRole: "CUSTOMER", orderId: ORDER, messages: [{ role: "user", content: "Where is my order?" }] };
const request = (body: unknown) => new NextRequest("https://craves.in/api/support/chat", {
  method: "POST", headers: { origin: "https://craves.in", "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("support chat BFF", () => {
  beforeEach(() => upstream.mockReset());

  it("forwards the validated conversation with the long model timeout", async () => {
    upstream.mockResolvedValue(Response.json({ reply: "It is on the way.", supportCase: null }));
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "It is on the way.", supportCase: null });
    const [, path, init, timeout] = upstream.mock.calls[0];
    expect(path).toBe("/support/chat");
    expect(JSON.parse(init.body)).toEqual({ ...valid, channel: "WEB" });
    expect(timeout).toBe(40_000);
  });

  it.each([
    ["more than 20 messages", { ...valid, messages: Array.from({ length: 21 }, () => valid.messages[0]) }],
    ["a last message that is not the user's", { ...valid, messages: [...valid.messages, { role: "assistant", content: "Hi" }] }],
    ["oversize content", { ...valid, messages: [{ role: "user", content: "x".repeat(2001) }] }],
    ["a malformed order id", { ...valid, orderId: "order-1" }],
    ["an unknown context role", { ...valid, contextRole: "ADMIN" }],
  ])("rejects %s without calling the backend", async (_, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("SUPPORT_CHAT_INVALID");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes rate limiting through with Retry-After", async () => {
    upstream.mockResolvedValue(Response.json({ code: "SUPPORT_CHAT_RATE_LIMITED", message: "Slow down" }, { status: 429, headers: { "Retry-After": "17" } }));
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect((await response.json()).code).toBe("SUPPORT_CHAT_RATE_LIMITED");
  });

  it("passes an unavailable assistant through", async () => {
    upstream.mockResolvedValue(Response.json({ code: "SUPPORT_CHAT_UNAVAILABLE", message: "Try later" }, { status: 503 }));
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("SUPPORT_CHAT_UNAVAILABLE");
  });
});
