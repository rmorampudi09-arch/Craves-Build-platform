import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/shared/lib/server-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: backend.fetch,
}));
import { GET as list } from "@/app/api/admin/account-deletions/route";
import { GET as detail } from "@/app/api/admin/account-deletions/[requestId]/route";
import { POST as approve } from "@/app/api/admin/account-deletions/[requestId]/approve/route";
import { POST as reject } from "@/app/api/admin/account-deletions/[requestId]/reject/route";
import { SessionRequiredError } from "@/shared/lib/server-api";

const origin = "https://admin.craves.in";
const base = `${origin}/api/admin/account-deletions`;
const requestId = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
const context = { params: Promise.resolve({ requestId }) };
const sameOrigin = { Origin: origin, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const summary = {
  requestId, identityId: "9d1f6a52-0000-4000-8000-000000000002", scope: "CHEF", status: "PENDING_REVIEW", via: "WEB",
  requestedAt: "2026-11-05T01:00:00Z", dueAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null,
};
const blockers = [{ service: "order", code: "OPEN_ORDERS", detail: "2 open orders" }];
const detailBody = {
  request: summary, phoneLast4: "6787", roles: ["CHEF"],
  steps: [{ phase: "ERASE", service: "catalog", status: "PENDING", attempts: 0, lastError: null, completedAt: null }],
  blockers,
};
const staff = (roles: string[]) => json({ identity: { email: "kushi.c@craves.in", status: "ACTIVE", roles } });
/** The detail call and the /auth/me roles call are told apart by path, so the order of the two does not matter. */
const serve = (detailResponse: () => Response, me: () => Response) =>
  backend.fetch.mockImplementation(async (_request: NextRequest, path: string) => (path === "/auth/me" ? me() : detailResponse()));
const getDetail = () => detail(new NextRequest(`${base}/${requestId}`), context);
const post = (handler: typeof approve, body: unknown, headers: Record<string, string> = sameOrigin, id = requestId) =>
  handler(new NextRequest(`${base}/${id}/decision`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ requestId: id }) });
const reason = "Checked the chef's open items.";

beforeEach(() => { backend.fetch.mockReset(); });

describe("admin deletion list", () => {
  it("forwards the status, cursor and a page size of 25, and sends only parsed fields", async () => {
    backend.fetch.mockResolvedValue(json({ items: [{ ...summary, internalNote: "never shown" }], nextCursor: "abc_-1" }));
    const response = await list(new NextRequest(`${base}?status=PENDING_REVIEW&cursor=abc_-1`));
    expect(response.status).toBe(200);
    expect(backend.fetch.mock.calls[0][1]).toBe("/admin/account-deletions?status=PENDING_REVIEW&cursor=abc_-1&limit=25");
    expect(backend.fetch.mock.calls[0][3]).toBe(10_000);
    expect(await response.json()).toEqual({ items: [summary], nextCursor: "abc_-1" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("lists every status when no filter is given", async () => {
    backend.fetch.mockResolvedValue(json({ items: [], nextCursor: null }));
    expect((await list(new NextRequest(base))).status).toBe(200);
    expect(backend.fetch.mock.calls[0][1]).toBe("/admin/account-deletions?limit=25");
  });

  it.each([
    ["an unknown status", "status=bogus"],
    ["a cursor with a slash", "cursor=ab/cd"],
    ["a cursor with a dot", "cursor=ab..cd"],
    ["an empty cursor", "cursor="],
    ["a cursor over 200 characters", `cursor=${"a".repeat(201)}`],
  ])("answers 400 for %s without calling the backend", async (_name, query) => {
    const response = await list(new NextRequest(`${base}?${query}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_QUERY" });
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("answers 502 when the backend page fails the parser", async () => {
    backend.fetch.mockResolvedValue(json({ items: [{ requestId }], nextCursor: null }));
    const response = await list(new NextRequest(base));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });
});

describe("admin deletion detail", () => {
  it("passes a 25 second timeout for the detail call, which asks eight services", async () => {
    serve(() => json(detailBody), () => staff(["COMPLIANCE_ADMIN"]));
    expect((await getDetail()).status).toBe(200);
    const call = backend.fetch.mock.calls.find(([, path]) => path !== "/auth/me")!;
    expect(call[1]).toBe(`/admin/account-deletions/${requestId}`);
    expect(call[3]).toBe(25_000);
  });

  it.each([
    ["COMPLIANCE_ADMIN", ["COMPLIANCE_ADMIN"], true],
    ["PLATFORM_ADMIN with another role", ["support_admin", " platform_admin "], true],
    ["SUPPORT_ADMIN", ["SUPPORT_ADMIN"], false],
  ])("sets canDecide for %s and never returns the staff member's roles or email", async (_name, roles, expected) => {
    serve(() => json(detailBody), () => staff(roles));
    const response = await getDetail();
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ...detailBody, canDecide: expected });
    expect(text).not.toContain("ADMIN");
    expect(text).not.toContain("kushi.c@craves.in");
  });

  it("reads staff roles from a flat /auth/me body too", async () => {
    serve(() => json(detailBody), () => json({ status: "ACTIVE", roles: ["PLATFORM_ADMIN"] }));
    expect((await (await getDetail()).json()).canDecide).toBe(true);
  });

  it.each([
    ["answers 503", () => new Response("down", { status: 503 })],
    ["answers 401", () => new Response("no", { status: 401 })],
    ["has no roles", () => json({ identity: { status: "ACTIVE" } })],
    ["is not JSON", () => new Response("<html>", { status: 200 })],
    ["throws", () => { throw new Error("network"); }],
  ])("sets canDecide false when /auth/me %s", async (_name, me) => {
    serve(() => json(detailBody), me);
    const response = await getDetail();
    expect(response.status).toBe(200);
    expect((await response.json()).canDecide).toBe(false);
  });

  it("answers 404 for an id that is not a UUID without calling the backend", async () => {
    const response = await detail(new NextRequest(`${base}/not-a-uuid`), { params: Promise.resolve({ requestId: "not-a-uuid" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NO_DELETION_REQUEST" });
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("answers 502 when the detail fails the parser", async () => {
    serve(() => json({ request: summary }), () => staff(["PLATFORM_ADMIN"]));
    const response = await getDetail();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });

  it.each([
    [404, "NO_DELETION_REQUEST", 404],
    [403, "ADMIN_ROLE_REQUIRED", 403],
    [403, "ADMIN_ACCESS_REQUIRED", 403],
    [503, "ACCOUNT_DELETION_NOT_ENABLED", 503],
  ])("passes %i %s through as %i", async (status, code, expected) => {
    backend.fetch.mockResolvedValue(json({ code, message: "private upstream text", timestamp: "t" }, status));
    const response = await getDetail();
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ code });
  });

  it("answers 401 ADMIN_SESSION_EXPIRED for an upstream 401 and for a missing session", async () => {
    backend.fetch.mockResolvedValue(json({ code: "UNAUTHORIZED", message: "x" }, 401));
    const expired = await getDetail();
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({ code: "ADMIN_SESSION_EXPIRED" });
    backend.fetch.mockRejectedValue(new SessionRequiredError("no cookie"));
    const missing = await getDetail();
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ code: "ADMIN_SESSION_EXPIRED" });
  });

  it("hides an unknown backend code and message behind 503, also when the backend cannot be reached", async () => {
    backend.fetch.mockResolvedValue(json({ code: "SOMETHING_ELSE", message: "private upstream text" }, 500));
    const refused = await getDetail();
    expect(refused.status).toBe(503);
    const text = await refused.text();
    expect(JSON.parse(text)).toEqual({ code: "ACCOUNT_DELETION_UNAVAILABLE" });
    expect(text).not.toContain("private upstream text");
    backend.fetch.mockRejectedValue(new Error("network"));
    expect((await getDetail()).status).toBe(503);
  });
});

// Approve waits for the eight-service open-items check (up to about 21 s); reject calls no service.
describe.each([["approve", approve, 25_000], ["reject", reject, 10_000]] as const)("admin deletion %s", (action, handler, timeoutMs) => {
  it(`gives the backend call ${timeoutMs} ms`, async () => {
    backend.fetch.mockImplementation(async () => json(summary));
    expect((await post(handler, { reason })).status).toBe(200);
    expect(backend.fetch.mock.calls[0][3]).toBe(timeoutMs);
  });

  it("forwards the trimmed reason to the backend", async () => {
    backend.fetch.mockResolvedValue(json({ ...summary, status: "SCHEDULED", reviewedBy: "staff-1", reviewNote: reason }));
    const response = await post(handler, { reason: `   ${reason}  `, status: "COMPLETED", extra: 1 });
    expect(response.status).toBe(200);
    const [, path, init] = backend.fetch.mock.calls[0];
    expect(path).toBe(`/admin/account-deletions/${requestId}/${action}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason });
    expect((await response.json()).requestId).toBe(requestId);
  });

  it.each([
    ["9 characters", { reason: "123456789" }],
    ["9 characters among spaces", { reason: "   123456789   " }],
    ["501 characters", { reason: "a".repeat(501) }],
    ["a missing reason", {}],
    ["a reason that is not a string", { reason: 1234567890 }],
    ["a body that is not JSON", "{not json"],
  ])("answers 400 ADMIN_REASON_INVALID for %s without calling the backend", async (_name, body) => {
    const response = await post(handler, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "ADMIN_REASON_INVALID" });
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("accepts a reason of exactly 10 and exactly 500 characters", async () => {
    backend.fetch.mockImplementation(async () => json(summary));
    expect((await post(handler, { reason: "1234567890" })).status).toBe(200);
    expect((await post(handler, { reason: "a".repeat(500) })).status).toBe(200);
  });

  it("refuses a cross-origin request before calling the backend", async () => {
    const response = await post(handler, { reason }, { Origin: "https://untrusted.example", "Content-Type": "application/json" });
    expect(response.status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that is not a UUID without calling the backend", async () => {
    const response = await post(handler, { reason }, sameOrigin, "not-a-uuid");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NO_DELETION_REQUEST" });
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("refuses an oversized body and a body that is not JSON before calling the backend", async () => {
    expect((await post(handler, "x".repeat(5000))).status).toBe(413);
    expect((await post(handler, "reason=abc", { Origin: origin, "Content-Type": "text/plain" })).status).toBe(415);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [403, "ACCOUNT_DELETION_OWN_REQUEST", 403],
    [403, "ADMIN_ROLE_REQUIRED", 403],
    [409, "ACCOUNT_DELETION_NOT_REVIEWABLE", 409],
    [404, "NO_DELETION_REQUEST", 404],
    [503, "ACCOUNT_DELETION_NOT_ENABLED", 503],
    [400, "ADMIN_REASON_INVALID", 400],
  ])("passes %i %s through as %i without the backend message", async (status, code, expected) => {
    backend.fetch.mockResolvedValue(json({ code, message: "private upstream text", timestamp: "t" }, status));
    const response = await post(handler, { reason });
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ code });
  });

  it("answers 401 ADMIN_SESSION_EXPIRED when the session is gone", async () => {
    backend.fetch.mockRejectedValue(new SessionRequiredError("no cookie"));
    const response = await post(handler, { reason });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "ADMIN_SESSION_EXPIRED" });
  });

  it("answers 502 when the backend summary fails the parser", async () => {
    backend.fetch.mockResolvedValue(json({ requestId }));
    const response = await post(handler, { reason });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });
});

describe("admin deletion approve with open items", () => {
  it("answers 409 with the blockers and no backend message", async () => {
    backend.fetch.mockResolvedValue(json({ code: "ACCOUNT_DELETION_HAS_OPEN_ITEMS", message: "private upstream text", blockers }, 409));
    const response = await post(approve, { reason });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "ACCOUNT_DELETION_HAS_OPEN_ITEMS", blockers });
  });

  it("answers 502 when the blockers fail the parser", async () => {
    backend.fetch.mockResolvedValue(json({ code: "ACCOUNT_DELETION_HAS_OPEN_ITEMS", blockers: "none" }, 409));
    const response = await post(approve, { reason });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });
});
