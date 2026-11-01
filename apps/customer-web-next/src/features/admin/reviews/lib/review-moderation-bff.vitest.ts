import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: backend.fetch, SessionRequiredError: class extends Error {} }));
import { GET, PUT } from "@/app/api/admin/reviews/[[...path]]/route";

const origin = "https://admin.craves.in";
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const reviewId = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const kitchenId = "8990a560-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const review = {
  reviewId, orderId: "c6c6481c-0000-4000-8000-000000000001", kitchenId, status: "PENDING_MODERATION", version: 2,
  overallRating: 4, foodTasteRating: null, portionValueRating: null, packagingRating: null, accuracyRating: null,
  chefPreparationRating: null, deliveryRating: null, reviewText: null, tagCodes: [], mediaAssetIds: [], helpfulCount: 0,
  submittedAt: "2026-10-02T03:51:00Z", updatedAt: "2026-10-26T14:24:00Z", publishedAt: null,
};
const put = (body: unknown, headers: Record<string, string> = { Origin: origin, "Content-Type": "application/json" }) =>
  PUT(new NextRequest(`${origin}/api/admin/reviews/${reviewId}/moderation`, { method: "PUT", headers, body: typeof body === "string" ? body : JSON.stringify(body) }), context([reviewId, "moderation"]));

describe("review moderation admin BFF", () => {
  beforeEach(() => { backend.fetch.mockReset(); });

  it("forwards only the allowlisted queue call and adds kitchen names", async () => {
    expect((await GET(new NextRequest(`${origin}/api/admin/reviews`), context(["..", "auth"]))).status).toBe(404);
    expect(backend.fetch).not.toHaveBeenCalled();
    backend.fetch
      .mockResolvedValueOnce(Response.json({ items: [review], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(Response.json({ radius: {}, kitchens: [{ id: kitchenId, kitchenName: "Relangi mavayya kitchen" }, { id: reviewId, kitchenName: "Other" }] }));
    const response = await GET(new NextRequest(`${origin}/api/admin/reviews?status=PENDING_MODERATION`), context());
    expect(response.status).toBe(200);
    expect(backend.fetch.mock.calls[0][1]).toBe("/admin/reviews?limit=25&status=PENDING_MODERATION");
    expect(backend.fetch.mock.calls[1][1]).toBe("/catalog/kitchens");
    const body = await response.json();
    expect(body.kitchenNames).toEqual({ [kitchenId]: "Relangi mavayya kitchen" });
    expect(body.items[0]).not.toHaveProperty("mediaAssetIds");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("still lists reviews when the kitchen list is unavailable", async () => {
    backend.fetch
      .mockResolvedValueOnce(Response.json({ items: [review], nextCursor: null, hasMore: false }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    const body = await (await GET(new NextRequest(`${origin}/api/admin/reviews`), context())).json();
    expect(body.items).toHaveLength(1);
    expect(body.kitchenNames).toEqual({});
  });

  it("refuses cross-origin decisions before calling Order Service", async () => {
    const response = await put({ action: "PUBLISH", reason: "Checked the order." }, { Origin: "https://untrusted.example", "Content-Type": "application/json" });
    expect(response.status).toBe(403); expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("sends only the action in the body and the reason in X-Admin-Reason", async () => {
    backend.fetch.mockResolvedValue(Response.json({ ...review, status: "PUBLISHED", publishedAt: "2026-10-26T15:00:00Z" }));
    const response = await put({ action: "PUBLISH", reason: "  Checked: genuine feedback.  " });
    expect(response.status).toBe(200);
    const [, target, init] = backend.fetch.mock.calls[0];
    expect(target).toBe(`/admin/reviews/${reviewId}/moderation`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ action: "PUBLISH" });
    expect(init.headers["X-Admin-Reason"]).toBe("Checked: genuine feedback.");
  });

  it("rejects a short reason, an unknown action and an oversized body without calling Order Service", async () => {
    expect((await put({ action: "PUBLISH", reason: "ok" })).status).toBe(400);
    expect((await put({ action: "DELETE", reason: "Checked the order." })).status).toBe(400);
    expect((await put("x".repeat(2049))).status).toBe(413);
    expect((await put("{not json")).status).toBe(400);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("explains a denied decision without passing the upstream text through", async () => {
    backend.fetch.mockResolvedValue(new Response("private upstream message", { status: 403 }));
    const response = await put({ action: "HIDE", reason: "Complaint from the kitchen checked." });
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain("private upstream message");
    expect(text).toContain("ADMIN or SUPPORT_ADMIN");
  });
});
