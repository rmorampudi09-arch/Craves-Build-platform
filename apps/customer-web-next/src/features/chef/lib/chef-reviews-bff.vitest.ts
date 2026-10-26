// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { GET as list } from "@/app/api/chef/reviews/route";
import { GET as summary } from "@/app/api/chef/reviews/kitchens/[kitchenId]/summary/route";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
const review = { reviewId: "22222222-2222-4222-8222-222222222222", kitchenId: KITCHEN, overallRating: 5, reviewText: null, tagCodes: [], publishedAt: "2026-10-20T10:00:00Z" };
const read = (query = "") => list(new NextRequest(`https://craves.in/api/chef/reviews${query}`));
const readSummary = (id = KITCHEN) => summary(new NextRequest(`https://craves.in/api/chef/reviews/kitchens/${id}/summary`), { params: Promise.resolve({ kitchenId: id }) });

beforeEach(() => { upstream.mockReset(); }); // braces: a returned function would run as teardown

describe("chef reviews BFF", () => {
  it("checks the query, then forwards it and returns the parsed page", async () => {
    for (const query of ["?limit=0", "?limit=51", "?cursor=a.b", "?kitchenId=kitchen"]) expect((await read(query)).status, query).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json({ items: [review], nextCursor: null, hasMore: false }));
    const response = await read(`?limit=03&cursor=abc_-1&kitchenId=${KITCHEN}`);
    expect([response.status, response.headers.get("cache-control"), (await response.json()).items[0].overallRating]).toEqual([200, "no-store", 5]);
    expect(upstream.mock.calls[0][1]).toBe(`/chef/reviews?limit=3&kitchenId=${KITCHEN}&cursor=abc_-1`);
  });

  it.each([
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [Response.json({ code: "INVALID_REVIEW_CURSOR" }, { status: 400 }), 400, "INVALID_REVIEW_CURSOR"],
    [new Response(null, { status: 401 }), 401, "SESSION_EXPIRED"],
    [new Response(null, { status: 500 }), 503, "CHEF_REVIEWS_FAILED"],
    [Response.json({ items: [{ ...review, overallRating: 0 }], nextCursor: null, hasMore: false }), 502, "INVALID_CHEF_REVIEWS_RESPONSE"],
  ])("maps upstream %# to %s %s", async (answer, status, code) => {
    upstream.mockResolvedValue(answer);
    const response = await read();
    expect([response.status, (await response.json()).code]).toEqual([status, code]);
  });

  it("answers the summary of the kitchen asked for only", async () => {
    expect((await readSummary("x")).status).toBe(400);
    upstream.mockResolvedValue(Response.json({ kitchenId: KITCHEN, reviewCount: 2, overallAverage: 4.5 }));
    expect(await (await readSummary()).json()).toEqual({ kitchenId: KITCHEN, reviewCount: 2, overallAverage: 4.5 });
    expect(upstream.mock.calls[0][1]).toBe(`/chef/reviews/kitchens/${KITCHEN}/summary`);
    upstream.mockResolvedValue(Response.json({ kitchenId: "33333333-3333-4333-8333-333333333333", reviewCount: 2, overallAverage: 4.5 }));
    expect((await readSummary()).status).toBe(502);
    upstream.mockResolvedValue(new Response(null, { status: 405 }));
    expect((await (await readSummary()).json()).code).toBe("FEATURE_NOT_AVAILABLE");
  });
});
