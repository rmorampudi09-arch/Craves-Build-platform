import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: backend.fetch, SessionRequiredError: class extends Error {} }));
import { GET, POST } from "@/app/api/admin/dead-letters/route";

const origin = "https://admin.craves.in";
const reason = "INC-42 Borzo webhooks stuck since 9 pm";
const item = {
  id: "6212c931-b8ac-4cc7-8cf6-3a9672046b11", source: "DELIVERY_WEBHOOK", provider: "borzo", kind: "DELIVERED", status: "DEAD_LETTER",
  attemptCount: 8, firstSeenAt: "2026-11-03T15:00:00.123456Z", lastChangedAt: "2026-11-03T16:10:00Z", nextAttemptAt: null,
  providerEventId: "evt-981", deliveryJobId: "8990a560-1c2d-4e3f-8a9b-0c1d2e3f4a5b", orderId: null, chefSubOrderId: null,
  lastError: "Delivery job not found", payloadBytes: 1834,
};
const page = { source: "DELIVERY_WEBHOOK", status: "DEAD_LETTER", total: 1, limit: 25, offset: 0, items: [item] };
const get = (query: string, headers: Record<string, string> = { "X-Admin-Reason": reason }) =>
  GET(new NextRequest(`${origin}/api/admin/dead-letters${query}`, { headers }));

describe("dead-letter admin BFF", () => {
  beforeEach(() => { backend.fetch.mockReset(); });

  it("forwards one listing with the reason and a fresh correlation id, never cached", async () => {
    backend.fetch.mockResolvedValue(Response.json(page));
    const response = await get("?source=DELIVERY_WEBHOOK&status=DEAD_LETTER&provider=borzo&limit=25&offset=0");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    const [, target, init] = backend.fetch.mock.calls[0];
    expect(target).toBe("/admin/operations/dead-letters?source=DELIVERY_WEBHOOK&status=DEAD_LETTER&provider=borzo&limit=25&offset=0");
    expect(init.headers["X-Admin-Reason"]).toBe(reason);
    expect(init.headers["X-Correlation-ID"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("X-Correlation-ID")).toBe(init.headers["X-Correlation-ID"]);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("refuses unknown, repeated or wrong filters and a missing reason before calling integration-service", async () => {
    for (const query of ["", "?source=PAYMENTS", "?source=DELIVERY_WEBHOOK&status=LOST", "?source=DELIVERY_WEBHOOK&limit=500",
      "?source=DELIVERY_WEBHOOK&offset=10001", "?source=DELIVERY_WEBHOOK&provider=Borzo", "?source=CASHFREE_WEBHOOK&provider=borzo",
      "?source=DELIVERY_WEBHOOK&constructor=x", "?source=DELIVERY_WEBHOOK&source=CASHFREE_WEBHOOK"]) {
      expect((await get(query)).status, query).toBe(400);
    }
    expect((await get("?source=DELIVERY_WEBHOOK", {})).status).toBe(400);
    expect((await get("?source=DELIVERY_WEBHOOK", { "X-Admin-Reason": "too short" })).status).toBe(400);
    expect((await get("?source=DELIVERY_WEBHOOK", { "X-Admin-Reason": "reason with a tab\tinside it" })).status).toBe(400);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("explains a switched-off console and never passes the service's own refusal text", async () => {
    backend.fetch.mockResolvedValueOnce(Response.json({ status: 404, error: "Not Found" }, { status: 404 }));
    const off = await get("?source=DELIVERY_COMMAND");
    expect(off.status).toBe(404);
    expect((await off.json()).message).toMatch(/CRAVES_DEAD_LETTER_CONSOLE_ENABLED/);
    backend.fetch.mockResolvedValueOnce(Response.json({ message: "An admin role for this source is required" }, { status: 403 }));
    const refused = await get("?source=CASHFREE_WEBHOOK");
    expect(refused.status).toBe(403);
    expect((await refused.json()).message).not.toMatch(/An admin role for this source/);
  });

  it("refuses an answer of the wrong shape or for another source", async () => {
    backend.fetch.mockResolvedValueOnce(Response.json({ ...page, items: [{ ...item, payload: "{}", payloadBytes: -1 }] }));
    expect((await get("?source=DELIVERY_WEBHOOK")).status).toBe(502);
    backend.fetch.mockResolvedValueOnce(Response.json(page));
    expect((await get("?source=DELIVERY_COMMAND")).status).toBe(502);
  });

  const retry = (query: string, headers: Record<string, string> = { Origin: origin, "X-Admin-Reason": reason }) =>
    POST(new NextRequest(`${origin}/api/admin/dead-letters${query}`, { method: "POST", headers }));

  it("asks integration-service for one more attempt on one delivery webhook, audited with the reason", async () => {
    backend.fetch.mockResolvedValue(Response.json({ ...item, status: "FAILED", attemptCount: 7, nextAttemptAt: "2026-11-04T22:40:00Z" }));
    const response = await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("FAILED");
    const [, target, init] = backend.fetch.mock.calls[0];
    expect(target).toBe(`/admin/operations/dead-letters/${item.id}/retry?source=DELIVERY_WEBHOOK`);
    expect(init.method).toBe("POST");
    expect(init.headers["X-Admin-Reason"]).toBe(reason);
    expect(response.headers.get("X-Correlation-ID")).toBe(init.headers["X-Correlation-ID"]);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("refuses other sources, bad ids, extra filters, a missing reason and other origins before calling integration-service", async () => {
    for (const query of ["", `?id=${item.id}`, `?id=${item.id}&source=CASHFREE_WEBHOOK`, `?id=${item.id}&source=DELIVERY_COMMAND`,
      "?id=not-a-uuid&source=DELIVERY_WEBHOOK", `?id=${item.id}&source=DELIVERY_WEBHOOK&status=FAILED`,
      `?id=${item.id}&id=${item.id}&source=DELIVERY_WEBHOOK`]) {
      expect((await retry(query)).status, query).toBe(400);
    }
    expect((await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`, { Origin: origin })).status).toBe(400);
    expect((await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`, { Origin: "https://evil.example", "X-Admin-Reason": reason })).status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("explains a switched-off retry and a record that cannot be retried, and refuses an answer for another record", async () => {
    backend.fetch.mockResolvedValueOnce(Response.json({ status: 404 }, { status: 404 }));
    const off = await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`);
    expect(off.status).toBe(404);
    expect((await off.json()).message).toMatch(/CRAVES_DEAD_LETTER_RETRY_ENABLED/);
    backend.fetch.mockResolvedValueOnce(Response.json({ message: "this one is PROCESSED" }, { status: 409 }));
    const conflict = await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).message).not.toMatch(/PROCESSED/);
    backend.fetch.mockResolvedValueOnce(Response.json({ ...item, id: "7212c931-b8ac-4cc7-8cf6-3a9672046b11" }));
    expect((await retry(`?id=${item.id}&source=DELIVERY_WEBHOOK`)).status).toBe(502);
  });
});
