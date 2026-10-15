// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import {
  GET as read,
  POST as create,
  PUT as update,
} from "@/app/api/orders/[orderId]/review/route";
import { GET as tags } from "@/app/api/reviews/tags/route";
import { SessionRequiredError } from "@/shared/lib/server-api";
import {
  getOrderReview,
  listReviewTags,
  OrderReviewError,
  saveOrderReview,
} from "@/features/orders/api/order-review";

const ORDER_ID = "0bde0000-0000-4000-8000-000000000010";
const review = {
  reviewId: "0bde0000-0000-4000-8000-000000000070",
  orderId: ORDER_ID,
  kitchenId: "0bde0000-0000-4000-8000-000000000020",
  status: "PENDING_MODERATION",
  version: 1,
  overallRating: 4,
  foodTasteRating: 5,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: "Lovely",
  tagCodes: ["TASTY"],
  mediaAssetIds: [],
  helpfulCount: 0,
  submittedAt: "2026-10-10T08:00:00Z",
  updatedAt: "2026-10-10T08:00:00Z",
  publishedAt: null,
};
const served: Record<string, unknown> = { ...review };
delete served.helpfulCount;
const valid = {
  overallRating: 5,
  foodTasteRating: null,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: "  Great biryani  ",
  tagCodes: ["TASTY", "WELL_PACKED"],
};
const params = { params: Promise.resolve({ orderId: ORDER_ID }) };

function request(init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in/api/orders/${ORDER_ID}/review`, {
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
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("order review BFF", () => {
  it("creates a review with trimmed text, no media, and returns it without the helpful count", async () => {
    upstream.mockResolvedValue(Response.json(review));
    const response = await create(request({ method: "POST", body: valid }), params);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(served);
    expect(upstream.mock.calls[0][1]).toBe(`/orders/${ORDER_ID}/review`);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({
      ...valid,
      reviewText: "Great biryani",
      mediaAssetIds: [],
    });
  });

  it("updates at the expected version and sends blank text as null", async () => {
    upstream.mockResolvedValue(Response.json({ ...review, version: 3 }));
    const response = await update(
      request({ method: "PUT", body: { ...valid, reviewText: "   ", expectedVersion: 2 } }),
      params,
    );
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0][2].method).toBe("PUT");
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toMatchObject({
      reviewText: null,
      expectedVersion: 2,
    });
  });

  it.each([
    { ...valid, overallRating: 0 },
    { ...valid, overallRating: 6 },
    { ...valid, overallRating: 4.5 },
    { ...valid, deliveryRating: 9 },
    { ...valid, reviewText: "x".repeat(2001) },
    { ...valid, tagCodes: ["tasty"] },
    { ...valid, tagCodes: ["TASTY", "TASTY"] },
    { ...valid, tagCodes: Array.from({ length: 11 }, (_, index) => `TAG_${index}`) },
    { ...valid, mediaAssetIds: [] },
    { ...valid, expectedVersion: 1 },
    { ...valid, foodTasteRating: undefined },
    null,
  ])("rejects a bad new review %#", async (body) => {
    expect((await create(request({ method: "POST", body }), params)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("needs a positive version to update", async () => {
    for (const expectedVersion of [undefined, 0, 1.5, "2"]) {
      expect(
        (await update(request({ method: "PUT", body: { ...valid, expectedVersion } }), params))
          .status,
      ).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes and bad order ids", async () => {
    expect(
      (
        await create(
          request({ method: "POST", body: valid, origin: "https://evil.example" }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await update(
          request({
            method: "PUT",
            body: { ...valid, expectedVersion: 1 },
            origin: "https://evil.example",
          }),
          params,
        )
      ).status,
    ).toBe(403);
    expect((await read(request(), { params: Promise.resolve({ orderId: "nope" }) })).status).toBe(
      400,
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [404, { error: "ORDER_REVIEW_NOT_FOUND", message: "x" }, 404, "ORDER_REVIEW_NOT_FOUND"],
    [
      409,
      { error: "ORDER_REVIEW_VERSION_CONFLICT", message: "x" },
      409,
      "ORDER_REVIEW_VERSION_CONFLICT",
    ],
    [404, { statusCode: 404, message: "Resource not found" }, 404, "FEATURE_NOT_AVAILABLE"],
    // Order-service's empty 403 is a failure, not a sign-out.
    [403, null, 403, "ORDER_REVIEW_FAILED"],
    [401, null, 401, "SESSION_EXPIRED"],
    [500, null, 503, "ORDER_REVIEW_FAILED"],
  ])("maps an upstream %s %j to %s %s", async (status, body, mappedStatus, code) => {
    upstream.mockResolvedValue(
      body ? Response.json(body, { status }) : new Response(null, { status }),
    );
    const response = await read(request(), params);
    expect([response.status, await response.json()]).toEqual([mappedStatus, { code }]);
  });

  it("answers 502 when the backend breaks the contract or names another order, 401 without a session", async () => {
    upstream.mockResolvedValueOnce(Response.json({ ...review, overallRating: 9 }));
    expect((await read(request(), params)).status).toBe(502);
    upstream.mockResolvedValueOnce(
      Response.json({ ...review, orderId: "0bde0000-0000-4000-8000-000000000011" }),
    );
    expect((await read(request(), params)).status).toBe(502);
    upstream.mockRejectedValueOnce(new SessionRequiredError());
    expect((await read(request(), params)).status).toBe(401);
  });

  it("lists the active tags in order and maps a missing route to Coming soon", async () => {
    const tag = (code: string, sortOrder: number, active = true) => ({
      code,
      displayLabel: code,
      dimension: "OVERALL",
      active,
      sortOrder,
      updatedAt: "2026-10-10T08:00:00Z",
    });
    upstream.mockResolvedValueOnce(
      Response.json([tag("WELL_PACKED", 2), tag("TASTY", 1), tag("OLD", 0, false)]),
    );
    const response = await tags(new NextRequest("https://craves.in/api/reviews/tags"));
    expect((await response.json()).map((item: { code: string }) => item.code)).toEqual([
      "TASTY",
      "WELL_PACKED",
    ]);
    expect(upstream.mock.calls[0][1]).toBe("/reviews/tags");
    upstream.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(
      await (await tags(new NextRequest("https://craves.in/api/reviews/tags"))).json(),
    ).toEqual({ code: "FEATURE_NOT_AVAILABLE" });
    upstream.mockResolvedValueOnce(Response.json([{ code: "bad code" }]));
    expect((await tags(new NextRequest("https://craves.in/api/reviews/tags"))).status).toBe(502);
  });
});

describe("order review browser client", () => {
  function answer(body: unknown, status = 200) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json(body, { status }),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("reads no review before the order is rated, and the saved one after", async () => {
    answer({ code: "ORDER_REVIEW_NOT_FOUND" }, 404);
    expect(await getOrderReview(ORDER_ID)).toBeNull();
    answer(served);
    expect((await getOrderReview(ORDER_ID))?.overallRating).toBe(4);
  });

  it("creates with POST and edits with PUT, sending back the ratings the web doesn't ask for", async () => {
    const created = answer(served);
    await saveOrderReview(ORDER_ID, { overallRating: 5, reviewText: " ", tagCodes: [] }, null);
    expect(created.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(created.mock.calls[0][1]?.body))).toEqual({
      ...valid,
      tagCodes: [],
      reviewText: null,
    });
    const edited = answer(served);
    await saveOrderReview(
      ORDER_ID,
      { overallRating: 3, reviewText: "Ok", tagCodes: ["TASTY"] },
      served as Parameters<typeof saveOrderReview>[2],
    );
    expect(edited.mock.calls[0][1]?.method).toBe("PUT");
    expect(JSON.parse(String(edited.mock.calls[0][1]?.body))).toMatchObject({
      expectedVersion: 1,
      overallRating: 3,
      foodTasteRating: 5,
      reviewText: "Ok",
    });
  });

  it.each([
    [404, { code: "FEATURE_NOT_AVAILABLE" }, "FEATURE_NOT_AVAILABLE"],
    [409, { code: "ORDER_REVIEW_VERSION_CONFLICT" }, "ORDER_REVIEW_VERSION_CONFLICT"],
    [403, { code: "ORDER_REVIEW_FAILED" }, "ORDER_REVIEW_FAILED"],
    [200, { nope: true }, "INVALID_ORDER_REVIEW_RESPONSE"],
  ])("turns a %s answer into OrderReviewError %j", async (status, body, code) => {
    answer(body, status);
    await expect(getOrderReview(ORDER_ID)).rejects.toMatchObject({
      name: "OrderReviewError",
      code,
    });
    expect(new OrderReviewError(code, status).status).toBe(status);
  });

  it("offers no tags when the list doesn't load", async () => {
    answer({ code: "FEATURE_NOT_AVAILABLE" }, 404);
    expect(await listReviewTags()).toEqual([]);
  });
});
