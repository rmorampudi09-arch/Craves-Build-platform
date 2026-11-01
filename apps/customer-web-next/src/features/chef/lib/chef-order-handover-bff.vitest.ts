// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { POST } from "@/app/api/chef/orders/[orderId]/handed-over/route";

const ID = "20000000-0000-0000-0000-000000000001";
const order = {
  id: ID,
  checkoutId: null,
  kitchenName: "Home Kitchen",
  status: "READY_FOR_PICKUP",
  currency: "INR",
  foodSubtotal: 250,
  platformFee: 10,
  taxAmount: 12,
  deliveryFee: 30,
  grandTotal: 302,
  items: [],
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T11:00:00Z",
  chefHandedOverAt: "2026-10-01T11:05:00Z",
};
const send = (id = ID, origin = "https://craves.in") =>
  POST(
    new NextRequest(`https://craves.in/api/chef/orders/${id}/handed-over`, {
      method: "POST",
      headers: { origin },
    }),
    { params: Promise.resolve({ orderId: id }) },
  );

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown

describe("chef handed-over BFF", () => {
  it("rejects cross-site posts and bad ids before calling the order service", async () => {
    expect((await send(ID, "https://evil.example")).status).toBe(403);
    expect((await send("not-an-id")).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("posts with no body and returns the stamped order", async () => {
    upstream.mockResolvedValue(Response.json(order));
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).chefHandedOverAt).toBe(order.chefHandedOverAt);
    expect(upstream.mock.calls[0].slice(1)).toEqual([
      `/chef/orders/${ID}/handed-over`,
      { method: "POST" },
    ]);
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [
      Response.json({ code: "ORDER_STATUS_CONFLICT" }, { status: 409 }),
      409,
      "ORDER_STATUS_CONFLICT",
    ],
    [Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 403 }), 403, "CHEF_HANDED_OVER_FAILED"],
    [new Response(null, { status: 500 }), 503, "CHEF_HANDED_OVER_FAILED"],
    [
      Response.json({ ...order, id: "20000000-0000-0000-0000-000000000002" }),
      502,
      "INVALID_CHEF_ORDER_RESPONSE",
    ],
    [Response.json({ ...order, status: "SHIPPED" }), 502, "INVALID_CHEF_ORDER_RESPONSE"],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await send();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("answers a missing session and an unreachable service", async () => {
    const { SessionRequiredError } = await import("@/shared/lib/server-api");
    upstream.mockRejectedValueOnce(new SessionRequiredError("signed out"));
    expect((await send()).status).toBe(401);
    upstream.mockRejectedValueOnce(new Error("down"));
    expect((await send()).status).toBe(503);
  });
});
