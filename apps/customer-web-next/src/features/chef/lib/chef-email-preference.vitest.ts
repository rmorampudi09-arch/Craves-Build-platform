// @vitest-environment node
// Synthetic preferences; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET, PUT } from "@/app/api/notifications/preferences/email/route";

const URL = "https://craves.in/api/notifications/preferences/email";
const put = (body: unknown, origin = "https://craves.in") =>
  new NextRequest(URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  upstream.mockReset();
});

describe("email preference BFF", () => {
  it.each([
    [[], true], // never changed: on, as in the app
    [[{ channel: "PUSH", enabled: false, updatedAt: null }], true],
    [[{ channel: "EMAIL", enabled: false, updatedAt: "2026-10-20T08:00:00Z" }], false],
  ])("reads %j as enabled=%s", async (rows, enabled) => {
    upstream.mockResolvedValue(Response.json(rows));
    const response = await GET(new NextRequest(URL));
    expect(await response.json()).toEqual({ enabled });
    expect(upstream.mock.calls[0][1]).toBe("/notifications/preferences");
  });

  it("reads a gateway without the route as Coming soon, and a bad answer as an error", async () => {
    upstream.mockResolvedValue(new Response("Not found", { status: 404 }));
    const missing = await GET(new NextRequest(URL));
    expect([missing.status, await missing.json()]).toEqual([404, { code: "FEATURE_NOT_AVAILABLE" }]);
    upstream.mockResolvedValue(Response.json([{ channel: "EMAIL", enabled: "yes" }]));
    expect((await GET(new NextRequest(URL))).status).toBe(502);
  });

  it("saves only a yes/no from this site, to the EMAIL channel", async () => {
    upstream.mockResolvedValue(Response.json({ channel: "EMAIL", enabled: false, updatedAt: null }));
    const saved = await PUT(put({ enabled: false }));
    expect(await saved.json()).toEqual({ enabled: false });
    expect(upstream.mock.calls[0][1]).toBe("/notifications/preferences/EMAIL");
    expect(JSON.parse(String(upstream.mock.calls[0][2].body))).toEqual({ enabled: false });
    expect((await PUT(put({ enabled: "no" }))).status).toBe(400);
    expect((await PUT(put({ enabled: true }, "https://evil.example"))).status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
