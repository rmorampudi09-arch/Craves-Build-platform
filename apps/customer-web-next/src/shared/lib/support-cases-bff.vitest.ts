// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { GET as list, POST as create } from "@/app/api/support/cases/route";
import { GET as read } from "@/app/api/support/cases/[caseId]/route";
import { POST as reply } from "@/app/api/support/cases/[caseId]/messages/route";
import { createSupportCase, getSupportCase, listSupportCases, replyToSupportCase, SupportCaseError } from "./support-cases-client";

const CASE_ID = "5a0c0000-0000-4000-8000-0000000000c1";
const ME = "1d000000-0000-4000-8000-000000000001";
const summary = { id: CASE_ID, caseNumber: "CRV-5A0C000000004000800000000000", requesterIdentityId: ME, requesterRole: "CHEF", orderId: null, subject: "Move my kitchen", status: "OPEN", assignedToIdentityId: null, lastRequesterMessageAt: null, lastSupportMessageAt: null, resolvedAt: null, closedAt: null, createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z" };
const detail = { supportCase: summary, messages: [{ id: "3e000000-0000-4000-8000-000000000001", senderIdentityId: ME, senderRole: "CHEF", body: "New address", internalNote: false, createdAt: "2026-10-10T08:00:00Z" }], statusHistory: [] };
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

function request(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: { ...(body ? { "content-type": "application/json", "content-length": String(body.length) } : {}), origin: init.origin ?? "https://craves.in" },
    body,
  });
}
const valid = { contextRole: "CHEF", orderId: null, subject: " Move my kitchen ", message: "New address" };

beforeEach(() => upstream.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("support cases BFF", () => {
  it("creates a case with trimmed input and returns the flattened case", async () => {
    upstream.mockResolvedValue(Response.json(detail, { status: 201 }));
    const response = await create(request("/api/support/cases", { method: "POST", body: valid }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).messages[0].body).toBe("New address");
    expect(upstream.mock.calls[0][1]).toBe("/support/cases");
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ ...valid, subject: "Move my kitchen" });
  });

  it.each([
    { ...valid, contextRole: "ADMIN" }, { ...valid, orderId: "not-a-uuid" }, { ...valid, orderId: undefined }, { ...valid, subject: "  " },
    { ...valid, subject: "s".repeat(161) }, { ...valid, message: "m".repeat(5001) }, { ...valid, extra: true }, null,
  ])("rejects bad create input %#", async (body) => {
    const response = await create(request("/api/support/cases", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes", async () => {
    expect((await create(request("/api/support/cases", { method: "POST", body: valid, origin: "https://evil.example" }))).status).toBe(403);
    expect((await reply(request(`/api/support/cases/${CASE_ID}/messages`, { method: "POST", body: { message: "hi" }, origin: "https://evil.example" }), params({ caseId: CASE_ID }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("validates the list query and forwards limit and cursor", async () => {
    for (const query of ["?limit=0", "?limit=51", "?limit=abc", `?cursor=${"c".repeat(513)}`, "?cursor="]) {
      expect((await list(request(`/api/support/cases${query}`))).status).toBe(400);
    }
    upstream.mockResolvedValue(Response.json({ cases: [summary], nextCursor: "next", hasMore: true }));
    const response = await list(request("/api/support/cases?limit=50&cursor=abc"));
    expect(await response.json()).toEqual({ items: [expect.objectContaining({ id: CASE_ID })], nextCursor: "next" });
    expect(upstream.mock.calls[0][1]).toBe("/support/cases?limit=50&cursor=abc");
  });

  it("checks ids, maps missing routes to Coming soon and keeps real backend codes", async () => {
    expect((await read(request("/api/support/cases/nope"), params({ caseId: "nope" }))).status).toBe(400);
    upstream.mockResolvedValueOnce(Response.json({ statusCode: 404, message: "Resource not found" }, { status: 404 }));
    const missing = await read(request(`/api/support/cases/${CASE_ID}`), params({ caseId: CASE_ID }));
    expect([missing.status, (await missing.json()).code]).toEqual([404, "FEATURE_NOT_AVAILABLE"]);
    upstream.mockResolvedValueOnce(Response.json({ code: "SUPPORT_CASE_NOT_FOUND", message: "x" }, { status: 404 }));
    expect(await (await read(request(`/api/support/cases/${CASE_ID}`), params({ caseId: CASE_ID }))).json()).toEqual({ code: "SUPPORT_CASE_NOT_FOUND" });
  });

  it("returns 502 when the backend breaks the contract", async () => {
    upstream.mockResolvedValue(Response.json({ ...detail, messages: [{ ...detail.messages[0], internalNote: true }] }));
    expect((await reply(request(`/api/support/cases/${CASE_ID}/messages`, { method: "POST", body: { message: "hi" } }), params({ caseId: CASE_ID }))).status).toBe(502);
    upstream.mockResolvedValue(Response.json({ cases: "nope" }));
    expect((await list(request("/api/support/cases"))).status).toBe(502);
  });
});

describe("support cases browser client", () => {
  function answer(body: unknown, status = 200) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json(body, { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  const flat = { ...summary, messages: [{ id: detail.messages[0].id, senderRole: "CHEF", body: "New address", createdAt: "2026-10-10T08:00:00Z" }] };

  it("sends a null order and reads back the case", async () => {
    const fetch = answer(flat, 201);
    expect((await createSupportCase({ contextRole: "CHEF", subject: "Move my kitchen", message: "New address" })).id).toBe(CASE_ID);
    expect(fetch.mock.calls[0]).toEqual(["/api/support/cases", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ contextRole: "CHEF", orderId: null, subject: "Move my kitchen", message: "New address" }) })]);
    answer(flat);
    expect((await replyToSupportCase(CASE_ID, "hi")).messages).toHaveLength(1);
    expect((await getSupportCase(CASE_ID)).subject).toBe("Move my kitchen");
    const page = answer({ items: [summary], nextCursor: null });
    expect((await listSupportCases("a b")).items).toHaveLength(1);
    expect(page.mock.calls[0][0]).toBe("/api/support/cases?cursor=a%20b");
  });

  it.each([
    [404, { code: "FEATURE_NOT_AVAILABLE" }, "FEATURE_NOT_AVAILABLE"],
    [401, { code: "AUTHENTICATION_REQUIRED" }, "SESSION_EXPIRED"],
    [400, { code: "SUBJECT_TOO_LONG" }, "SUBJECT_TOO_LONG"],
    [503, null, "SUPPORT_CASE_FAILED"],
    [200, { nope: true }, "INVALID_SUPPORT_CASE_RESPONSE"],
  ])("turns a %s answer into SupportCaseError %s", async (status, body, code) => {
    answer(body, status);
    const error = await getSupportCase(CASE_ID).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SupportCaseError);
    expect((error as SupportCaseError).code).toBe(code);
  });
});
