// @vitest-environment node
// No backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET, PUT } from "@/app/api/chef/kitchen/settings/route";

function request(init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest("https://craves.in/api/chef/kitchen/settings", {
    method: init.method ?? "GET",
    headers: {
      ...(body
        ? { "content-type": "application/json", "content-length": String(body.length) }
        : {}),
      origin: init.origin ?? "https://craves.in",
    },
    body,
  });
}

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown

describe("kitchen settings BFF", () => {
  it("reads the settings, an unset cooking time as null", async () => {
    upstream.mockResolvedValue(Response.json({ autoAcceptOrders: false }));
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ autoAcceptOrders: false, defaultPrepMinutes: null });
    expect(upstream.mock.calls[0][1]).toBe("/kitchens/me/settings");
  });

  it("saves both settings and refuses anything else before calling the backend", async () => {
    upstream.mockResolvedValue(Response.json({ autoAcceptOrders: true, defaultPrepMinutes: 25 }));
    expect(
      (
        await PUT(
          request({ method: "PUT", body: { autoAcceptOrders: true, defaultPrepMinutes: 25 } }),
        )
      ).status,
    ).toBe(200);
    expect([upstream.mock.calls[0][2].method, JSON.parse(upstream.mock.calls[0][2].body)]).toEqual([
      "PUT",
      { autoAcceptOrders: true, defaultPrepMinutes: 25 },
    ]);
    upstream.mockClear();
    for (const body of [
      { autoAcceptOrders: true, defaultPrepMinutes: 4 },
      { autoAcceptOrders: true, defaultPrepMinutes: 121 },
      { autoAcceptOrders: "yes", defaultPrepMinutes: null },
      { autoAcceptOrders: true },
      { autoAcceptOrders: true, defaultPrepMinutes: null, pushEnabled: true },
      null,
    ]) {
      expect((await PUT(request({ method: "PUT", body }))).status).toBe(400);
    }
    expect(
      (
        await PUT(
          request({
            method: "PUT",
            body: { autoAcceptOrders: true, defaultPrepMinutes: null },
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "KITCHEN_NOT_FOUND" }, { status: 404 }), 404, "KITCHEN_NOT_FOUND"],
    [Response.json({}, { status: 401 }), 401, "SESSION_EXPIRED"],
    [Response.json({ code: "CHEF_ROLE_REQUIRED" }, { status: 403 }), 403, "CHEF_ROLE_REQUIRED"],
    [new Response(null, { status: 502 }), 503, "KITCHEN_SETTINGS_FAILED"],
    [
      Response.json({ autoAcceptOrders: true, defaultPrepMinutes: 500 }),
      502,
      "INVALID_KITCHEN_SETTINGS_RESPONSE",
    ],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await GET(request());
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});
