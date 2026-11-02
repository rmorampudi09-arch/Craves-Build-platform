import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/public-api", () => ({ publicApiFetch: upstream }));
import { POST } from "@/app/api/support/chat/guest/route";

const valid = { messages: [{ role: "user", content: "I didn't get my OTP" }] };
const request = (body: unknown, extra: Record<string, string> = {}) => new NextRequest("https://craves.in/api/support/chat/guest", {
  method: "POST", headers: { origin: "https://craves.in", "Content-Type": "application/json", ...extra }, body: JSON.stringify(body),
});
const hash = (ip: string) => createHash("sha256").update(`craves-support-guest:${ip}`).digest("hex");

describe("guest support chat BFF", () => {
  beforeEach(() => upstream.mockReset());

  it("forwards the conversation without any session, with a hashed visitor key and the website channel", async () => {
    upstream.mockResolvedValue(Response.json({ reply: "Tap Resend OTP after 30 seconds.", supportCase: null }));
    const response = await POST(request(valid, { "x-azure-socketip": "203.0.113.7", "x-azure-clientip": "198.51.100.2", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Tap Resend OTP after 30 seconds.", supportCase: null });
    const [path, init, timeout] = upstream.mock.calls[0];
    expect(path).toBe("/support/chat/guest");
    expect(JSON.parse(init.body)).toEqual({ ...valid, channel: "WEB" });
    expect(init.headers["X-Craves-Visitor"]).toBe(hash("203.0.113.7"));
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain("203.0.113.7");
    expect(timeout).toBe(40_000);
  });

  it.each([
    ["caller-written address headers", { "x-azure-clientip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.1" }],
    ["no address header", {}],
    ["a socket header that is not an IP", { "x-azure-socketip": "evil.example" }],
  ])("shares the unknown bucket for %s", async (_, headers) => {
    upstream.mockResolvedValue(Response.json({ reply: "Hi", supportCase: null }));
    await POST(request(valid, headers));
    expect(upstream.mock.calls[0][1].headers["X-Craves-Visitor"]).toBe(hash("unknown"));
  });

  it("gives an IPv6 visitor one bucket for their whole /64", async () => {
    upstream.mockResolvedValue(Response.json({ reply: "Hi", supportCase: null }));
    await POST(request(valid, { "x-azure-socketip": "2001:db8::1" }));
    await POST(request(valid, { "x-azure-socketip": "2001:DB8:0:0:ffff:ffff:ffff:fffe" }));
    await POST(request(valid, { "x-azure-socketip": "2001:db8:0:1::1" }));
    const keys = upstream.mock.calls.map(call => call[1].headers["X-Craves-Visitor"]);
    expect(keys[0]).toBe(hash("2001:0db8:0000:0000::/64"));
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it.each([
    ["an account role", { ...valid, contextRole: "CUSTOMER" }],
    ["an order id", { ...valid, orderId: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11" }],
    ["a last message that is not the user's", { messages: [...valid.messages, { role: "assistant", content: "Hi" }] }],
    ["oversize content", { messages: [{ role: "user", content: "x".repeat(2001) }] }],
  ])("rejects %s without calling the backend", async (_, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("SUPPORT_CHAT_INVALID");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("passes rate limiting through with Retry-After", async () => {
    upstream.mockResolvedValue(Response.json({ code: "SUPPORT_CHAT_RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "40" } }));
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("40");
  });
});
