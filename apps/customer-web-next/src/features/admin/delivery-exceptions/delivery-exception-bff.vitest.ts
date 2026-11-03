import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: backend.fetch, SessionRequiredError: class extends Error {} }));
import { GET, POST } from "@/app/api/admin/delivery-exceptions/[[...segments]]/route";
import { exceptionError } from "./delivery-exception-contract";

const origin = "https://admin.craves.in";
const caseId = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const orderId = "c6c6481c-0000-4000-8000-000000000001";
const context = (segments?: string[]) => ({ params: Promise.resolve({ segments }) });
const exceptionCase = {
  id: caseId, deliveryJobId: "8990a560-1c2d-4e3f-8a9b-0c1d2e3f4a5b", orderId, currentProviderId: "borzo", deliveryStatus: "SEARCHING_AGENT",
  reason: "RIDER_NOT_ASSIGNED", status: "OPEN", assigneeId: null, reassignToProviderId: null, resolutionNote: null,
  openedBy: "1f0c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", version: 0, createdAt: "2026-11-02T18:00:00.123456Z", updatedAt: "2026-11-02T18:00:00Z", closedAt: null,
};
const detail = { exceptionCase, events: [{ id: 1, action: "OPEN", status: "OPEN", actorId: exceptionCase.openedBy, note: null, occurredAt: "2026-11-02T18:00:00Z" }] };
const post = (segments: string[] | undefined, body: unknown, headers: Record<string, string> = { Origin: origin, "Content-Type": "application/json" }) =>
  POST(new NextRequest(`${origin}/api/admin/delivery-exceptions/${(segments ?? []).join("/")}`, { method: "POST", headers, body: JSON.stringify(body) }), context(segments));

describe("delivery exceptions admin BFF", () => {
  beforeEach(() => { backend.fetch.mockReset(); });

  it("lists cases with only the known filters", async () => {
    backend.fetch.mockResolvedValue(Response.json({ items: [exceptionCase], hasMore: false }));
    const response = await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions?status=OPEN&orderId=${orderId}&limit=30&offset=0`), context());
    expect(response.status).toBe(200);
    expect(backend.fetch.mock.calls[0][1]).toBe(`/admin/operations/delivery-exceptions?status=OPEN&orderId=${orderId}&limit=30&offset=0`);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions?status=LOST`), context())).status).toBe(400);
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions?limit=500`), context())).status).toBe(400);
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions?constructor=x`), context())).status).toBe(400);
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions/x/y`), context(["x", "y"]))).status).toBe(404);
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions/../auth`), context(["..", "auth"]))).status).toBe(404);
    expect(backend.fetch).toHaveBeenCalledTimes(1);
  });

  it("opens by order and forwards only the case fields", async () => {
    backend.fetch.mockResolvedValue(Response.json(detail, { status: 201 }));
    const response = await post(undefined, { orderId: ` ${orderId} `, reason: "RIDER_NOT_ASSIGNED", note: " no rider ", role: "PLATFORM_ADMIN" });
    expect(response.status).toBe(201);
    const [, target, init] = backend.fetch.mock.calls[0];
    expect(target).toBe("/admin/operations/delivery-exceptions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ orderId, reason: "RIDER_NOT_ASSIGNED", note: "no rider" });
  });

  it("refuses bad bodies and other origins before calling integration-service", async () => {
    expect((await post(undefined, { reason: "PICKUP_DELAYED" })).status).toBe(400);
    expect((await post(undefined, { orderId, deliveryJobId: orderId, reason: "PICKUP_DELAYED" })).status).toBe(400);
    expect((await post(undefined, { orderId, reason: "OTHER" })).status).toBe(400);
    expect((await post([caseId, "actions"], { action: "RESOLVE", expectedVersion: 1 })).status).toBe(400);
    expect((await post([caseId, "actions"], { action: "REQUEST_REASSIGNMENT", expectedVersion: 1 })).status).toBe(400);
    expect((await post([caseId, "actions"], { action: "ASSIGN", expectedVersion: 1 }, { Origin: "https://evil.example", "Content-Type": "application/json" })).status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("acts on a case and passes the service's reason for a refusal", async () => {
    backend.fetch.mockResolvedValueOnce(Response.json({ ...detail, exceptionCase: { ...exceptionCase, version: 1, assigneeId: exceptionCase.openedBy } }));
    expect((await post([caseId, "actions"], { action: "ASSIGN", expectedVersion: 0 })).status).toBe(200);
    expect(backend.fetch.mock.calls[0][1]).toBe(`/admin/operations/delivery-exceptions/${caseId}/actions`);
    expect(JSON.parse(backend.fetch.mock.calls[0][2].body)).toEqual({ action: "ASSIGN", expectedVersion: 0 });
    backend.fetch.mockResolvedValueOnce(Response.json({ code: "CONFLICT", message: "Case changed since version 0" }, { status: 409 }));
    const refused = await post([caseId, "actions"], { action: "ACKNOWLEDGE", expectedVersion: 0 });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ code: "CONFLICT", message: "Case changed since version 0" });
  });

  it("explains a switched-off console and never echoes a role refusal", async () => {
    backend.fetch.mockResolvedValueOnce(Response.json({ code: "DELIVERY_EXCEPTIONS_DISABLED", message: "" }, { status: 404 }));
    const off = await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions/${caseId}`), context([caseId]));
    expect(off.status).toBe(404);
    expect((await off.json()).message).toMatch(/switched off/);
    expect(exceptionError(403, { code: "ADMIN_ROLE_REQUIRED", message: "Operations admin role is required" }).message).not.toMatch(/Operations admin role/);
    backend.fetch.mockResolvedValueOnce(Response.json({ items: [{ ...exceptionCase, status: "LOST" }], hasMore: false }));
    expect((await GET(new NextRequest(`${origin}/api/admin/delivery-exceptions`), context())).status).toBe(502);
  });
});
