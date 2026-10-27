// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...(await original<typeof import("@/shared/lib/server-api")>()), authenticatedApiFetch: upstream }));
import { SessionRequiredError } from "@/shared/lib/server-api";
import { GET } from "@/app/api/orders/page/route";

const order = {
  id: "11111111-2222-4333-8444-555555555555", checkoutId: null, kitchenId: "41111111-2222-4333-8444-555555555555", kitchenName: "Home Kitchen",
  status: "DELIVERED", currency: "INR", foodSubtotal: 250, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 250, chefResponseNote: null,
  prepTimeMinutes: null, deliveryAddress: null, items: [], createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T11:00:00Z",
  customerIdentityId: "31111111-2222-4333-8444-555555555555",
};
const page = { orders: [order], nextCursor: "MjAyNi0xMC0wMQ", hasMore: true };
const read = (query = "") => GET(new NextRequest(`https://craves.in/api/orders/page${query}`));

beforeEach(() => {
  upstream.mockReset();
});

describe("My Orders page BFF", () => {
  it("checks the query before calling the order service", async () => {
    for (const query of ["?limit=0", "?limit=51", "?limit=abc", "?limit=", "?cursor=", `?cursor=${"c".repeat(513)}`, "?cursor=a%2Bb", "?cursor=a..b"]) {
      expect((await read(query)).status, query).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards limit and cursor and returns only the allowed fields", async () => {
    upstream.mockResolvedValue(Response.json(page));
    const response = await read("?limit=05&cursor=MjAyNi0xMC0wMQ");
    expect(upstream.mock.calls[0][1]).toBe("/orders/page?limit=5&cursor=MjAyNi0xMC0wMQ");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect([body.hasMore, body.nextCursor, body.orders[0].kitchenName]).toEqual([true, "MjAyNi0xMC0wMQ", "Home Kitchen"]);
    expect("customerIdentityId" in body.orders[0]).toBe(false);
    await read();
    expect(upstream.mock.calls[1][1]).toBe("/orders/page?limit=20");
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 500 }), 503, "ORDER_HISTORY_FAILED"],
    [Response.json({ ...page, nextCursor: null }), 502, "INVALID_ORDER_HISTORY_RESPONSE"],
    [Response.json({ ...page, orders: [order, order] }), 502, "INVALID_ORDER_HISTORY_RESPONSE"],
    [Response.json([order]), 502, "INVALID_ORDER_HISTORY_RESPONSE"],
  ])("maps upstream answer %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await read();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("answers a missing sign-in and an unreachable service without calling them errors of the page", async () => {
    upstream.mockRejectedValueOnce(new SessionRequiredError("no cookie"));
    expect([(await read()).status]).toEqual([401]);
    upstream.mockRejectedValueOnce(new Error("socket hang up"));
    const down = await read();
    expect([down.status, (await down.json()).code]).toEqual([503, "ORDER_HISTORY_UNAVAILABLE"]);
  });
});
