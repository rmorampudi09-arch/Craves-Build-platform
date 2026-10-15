// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { GET } from "@/app/api/chef/orders/page/route";
import { ChefOrderHistoryError, fetchChefOrderHistoryPage } from "@/features/chef/api/chef-order-history";

const order = { id: "11111111-2222-4333-8444-555555555555", kitchenName: "Home Kitchen", status: "DELIVERED", currency: "INR", foodSubtotal: 250, platformFee: 10, taxAmount: 12, deliveryFee: 30, grandTotal: 302, items: [], createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T11:00:00Z" };
const page = { orders: [order], nextCursor: "next", hasMore: true };
const read = (query = "") => GET(new NextRequest(`https://craves.in/api/chef/orders/page${query}`));

beforeEach(() => { upstream.mockReset(); }); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("chef order history BFF", () => {
  it("validates the query before calling the order service", async () => {
    for (const query of ["?limit=0", "?limit=51", "?limit=abc", "?limit=", `?cursor=${"c".repeat(513)}`, "?cursor=", "?status=SHIPPED", "?status=delivered", "?status="]) {
      expect((await read(query)).status, query).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards limit, cursor and status and returns the parsed page", async () => {
    upstream.mockResolvedValue(Response.json(page));
    const response = await read("?limit=05&cursor=a%2Bb&status=DELIVERED");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).nextCursor).toBe("next");
    expect(upstream.mock.calls[0][1]).toBe("/chef/orders/page?limit=5&cursor=a%2Bb&status=DELIVERED");
    await read();
    expect(upstream.mock.calls[1][1]).toBe("/chef/orders/page?limit=20");
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 403 }), 403, "CHEF_ORDER_HISTORY_FAILED"],
    [new Response(null, { status: 500 }), 503, "CHEF_ORDER_HISTORY_FAILED"],
    [Response.json({ ...page, nextCursor: null }), 502, "INVALID_CHEF_ORDER_HISTORY_RESPONSE"],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await read();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });
});

describe("chef order history browser helper", () => {
  it("builds the query and throws a coded error", async () => {
    const fetch = vi.fn(async () => Response.json(page));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchChefOrderHistoryPage({ cursor: "a b", status: "DELIVERED" })).orders[0].id).toBe(order.id);
    expect(fetch.mock.calls[0]).toEqual(["/api/chef/orders/page?limit=20&cursor=a+b&status=DELIVERED", expect.objectContaining({ cache: "no-store", credentials: "same-origin" })]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "FEATURE_NOT_AVAILABLE" }, { status: 404 })));
    const error = await fetchChefOrderHistoryPage().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ChefOrderHistoryError);
    expect([(error as ChefOrderHistoryError).code, (error as ChefOrderHistoryError).status]).toEqual(["FEATURE_NOT_AVAILABLE", 404]);
  });
});
