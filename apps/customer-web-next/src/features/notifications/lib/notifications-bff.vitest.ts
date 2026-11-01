// @vitest-environment node
// Synthetic notices; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { SessionRequiredError } from "@/shared/lib/server-api";
import { GET as page } from "@/app/api/notifications/in-app/page/route";
import { GET as unreadCount } from "@/app/api/notifications/in-app/unread-count/route";

const notice = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "New order",
  body: "Answer it soon.",
  noticeType: "CHEF_ORDER_AWAITING_ACCEPTANCE",
  targetType: "ORDER",
  targetId: null,
  readAt: null,
  createdAt: "2026-10-15T08:00:00Z",
};
const request = (path: string) => new NextRequest(`https://craves.in${path}`);

beforeEach(() => {
  upstream.mockReset();
});

describe("notification page BFF", () => {
  it("forwards a bounded query and returns the checked page", async () => {
    upstream.mockResolvedValue(
      Response.json({ notices: [notice], nextCursor: "MjAyNi0xMC0xNQ", hasMore: true }),
    );
    const response = await page(
      request("/api/notifications/in-app/page?limit=20&cursor=MjAyNi0xMA&role=CHEF"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      notices: [notice],
      nextCursor: "MjAyNi0xMC0xNQ",
      hasMore: true,
    });
    expect(upstream.mock.calls[0][1]).toBe(
      "/notifications/in-app/page?limit=20&cursor=MjAyNi0xMA&role=CHEF",
    );
  });

  it.each([
    "?limit=0",
    "?limit=101",
    "?limit=abc",
    "?cursor=",
    `?cursor=${"c".repeat(513)}`,
    "?cursor=a%3Db",
    "?role=ADMIN",
  ])("rejects %s", async (query) => {
    expect((await page(request(`/api/notifications/in-app/page${query}`))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("says the route is coming soon when the gateway has no such route, and maps sign-out and bad answers", async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const missing = await page(request("/api/notifications/in-app/page"));
    expect([missing.status, await missing.json()]).toEqual([
      404,
      { code: "FEATURE_NOT_AVAILABLE" },
    ]);
    upstream.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect((await (await page(request("/api/notifications/in-app/page"))).json()).code).toBe(
      "SESSION_EXPIRED",
    );
    upstream.mockResolvedValueOnce(
      Response.json({ notices: [notice], nextCursor: null, hasMore: true }),
    );
    expect((await page(request("/api/notifications/in-app/page"))).status).toBe(502);
    upstream.mockRejectedValueOnce(new SessionRequiredError());
    expect((await page(request("/api/notifications/in-app/page"))).status).toBe(401);
    upstream.mockRejectedValueOnce(new Error("down"));
    expect((await page(request("/api/notifications/in-app/page"))).status).toBe(503);
  });
});

describe("unread count BFF", () => {
  it("returns only the count, for the chef's notices", async () => {
    upstream.mockResolvedValue(Response.json({ unreadCount: 4, extra: true }));
    const response = await unreadCount(request("/api/notifications/in-app/unread-count?role=CHEF"));
    expect(await response.json()).toEqual({ unreadCount: 4 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(upstream.mock.calls[0][1]).toBe("/notifications/in-app/unread-count?role=CHEF");
  });

  it("rejects an unknown role and maps failures", async () => {
    expect(
      (await unreadCount(request("/api/notifications/in-app/unread-count?role=chef"))).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(new Response(null, { status: 405 }));
    expect(
      (await (await unreadCount(request("/api/notifications/in-app/unread-count"))).json()).code,
    ).toBe("FEATURE_NOT_AVAILABLE");
    upstream.mockResolvedValueOnce(Response.json({ unreadCount: -2 }));
    expect((await unreadCount(request("/api/notifications/in-app/unread-count"))).status).toBe(502);
    upstream.mockResolvedValueOnce(Response.json({ code: "NOTIFICATIONS_DOWN" }, { status: 500 }));
    const down = await unreadCount(request("/api/notifications/in-app/unread-count"));
    expect([down.status, (await down.json()).code]).toEqual([503, "NOTIFICATIONS_DOWN"]);
  });
});
