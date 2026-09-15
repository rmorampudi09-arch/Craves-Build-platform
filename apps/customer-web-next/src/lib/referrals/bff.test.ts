import { describe, expect, it, vi } from "vitest";
import { createReferralBff } from "./bff.server";
const options = { enabled: true, publicOrigin: "https://craves.in", backendOrigin: "https://referrals.internal.example", resolveSession: async () => ({ accessToken: "server-owned-token", roles: ["ADMIN"] }) };
const request = (path = "/me", init: RequestInit = {}) => new Request("https://craves.in/api/referrals" + path, init);
describe("unmounted referral BFF boundary", () => {
  it("is inert when disabled", async () => {
    const resolveSession = vi.fn(); const handler = createReferralBff({ ...options, enabled: false, resolveSession });
    expect((await handler(request())).status).toBe(503); expect(resolveSession).not.toHaveBeenCalled();
  });
  it("never forwards browser credentials, user IDs or cookies", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const upstream: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ ok: true }); };
    const handler = createReferralBff({ ...options, fetchImpl: upstream });
    const response = await handler(request("/me", { headers: { Authorization: "Bearer attacker", Cookie: "secret=browser", "X-User-Id": "attacker" } }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(calls[0].init?.headers).toEqual({ Authorization: "Bearer server-owned-token", Accept: "application/json" });
    expect(calls[0].init?.redirect).toBe("error");
    expect(calls[0].url).toBe("https://referrals.internal.example/api/v1/referrals/me");
  });
  it("rejects missing origin, cross-site JSON, duplicate query and internal routes", async () => {
    const upstream = vi.fn(async () => Response.json({ ok: true })); const handler = createReferralBff({ ...options, fetchImpl: upstream });
    expect((await handler(request("/me/cashouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).status).toBe(403);
    expect((await handler(request("/me", { headers: { "Sec-Fetch-Site": "cross-site" } }))).status).toBe(403);
    expect((await handler(request("/me/rewards?limit=1&limit=100"))).status).toBe(422);
    expect((await handler(request("/internal/events"))).status).toBe(405); expect(upstream).not.toHaveBeenCalled();
  });
  it("enforces admin role independently of the backend", async () => {
    const handler = createReferralBff({ ...options, resolveSession: async () => ({ accessToken: "token", roles: ["CUSTOMER"] }) });
    expect((await handler(request("/admin/overview"))).status).toBe(403);
  });
  it("bounds input and redacts upstream error bodies", async () => {
    const handler = createReferralBff({ ...options, fetchImpl: async () => new Response("secret stack trace", { status: 500 }) });
    expect(await (await handler(request())).text()).not.toContain("secret");
    expect((await handler(request("/me/cashouts", { method: "POST", headers: { Origin: "https://craves.in", "Content-Type": "application/json" }, body: JSON.stringify({ pad: "a".repeat(33000) }) }))).status).toBe(413);
  });
  it("treats a timed-out write as uncertain, without retry", async () => {
    const upstream = vi.fn(async () => { throw new Error("timeout"); }); const handler = createReferralBff({ ...options, fetchImpl: upstream });
    const response = await handler(request("/me/cashouts", { method: "POST", headers: { Origin: "https://craves.in", "Content-Type": "application/json" }, body: "{}" }));
    expect(await response.json()).toEqual({ code: "REQUEST_UNCERTAIN" }); expect(upstream).toHaveBeenCalledTimes(1);
  });
});
