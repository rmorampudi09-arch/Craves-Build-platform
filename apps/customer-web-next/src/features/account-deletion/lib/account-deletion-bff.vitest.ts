import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/shared/lib/server-api", () => ({
  authenticatedApiFetch: backend.fetch,
  SessionRequiredError: class SessionRequiredError extends Error {},
}));
import { DELETE, GET, POST } from "@/app/api/account-deletion/route";
import { SessionRequiredError } from "@/shared/lib/server-api";

const origin = "https://craves.in";
const url = `${origin}/api/account-deletion`;
const view = { requestId: "r-1", scope: "ALL", status: "PENDING_REVIEW", requestedAt: "2026-11-05T01:00:00Z", dueAt: null, reviewNote: null };
const sameOrigin = { Origin: origin, "Content-Type": "application/json" };
const post = (body: unknown, headers: Record<string, string> = sameOrigin) =>
  POST(new NextRequest(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("account deletion BFF", () => {
  beforeEach(() => { backend.fetch.mockReset(); });

  it("GET returns the person's request", async () => {
    backend.fetch.mockResolvedValue(json(view));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(view);
    expect(backend.fetch.mock.calls[0][1]).toBe("/auth/me/deletion");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("GET turns 404 NO_DELETION_REQUEST into { none: true }", async () => {
    backend.fetch.mockResolvedValue(json({ code: "NO_DELETION_REQUEST", message: "none", timestamp: "t" }, 404));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ none: true });
  });

  it("GET maps a gateway 404 without a code to FEATURE_NOT_AVAILABLE", async () => {
    backend.fetch.mockResolvedValue(new Response("not found", { status: 404 }));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "FEATURE_NOT_AVAILABLE" });
  });

  it("GET passes ACCOUNT_DELETION_NOT_ENABLED through as 503", async () => {
    backend.fetch.mockResolvedValue(json({ code: "ACCOUNT_DELETION_NOT_ENABLED", message: "off", timestamp: "t" }, 503));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "ACCOUNT_DELETION_NOT_ENABLED" });
  });

  it("GET without a session answers 401 SESSION_EXPIRED", async () => {
    backend.fetch.mockRejectedValue(new SessionRequiredError("no cookie"));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "SESSION_EXPIRED" });
  });

  it("GET answers 502 when the backend body fails the parser", async () => {
    backend.fetch.mockResolvedValue(json({ requestId: "r-1", scope: "EVERYTHING" }));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });

  it("GET answers 503 when the backend cannot be reached", async () => {
    backend.fetch.mockRejectedValue(new Error("network"));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "ACCOUNT_DELETION_UNAVAILABLE" });
  });

  it("POST from another origin is refused before the backend is called", async () => {
    const response = await post({ scope: "ALL" }, { Origin: "https://untrusted.example", "Content-Type": "application/json" });
    expect(response.status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it("POST never trusts a client-sent via", async () => {
    backend.fetch.mockResolvedValue(json(view, 201));
    const response = await post({ scope: "ALL", via: "APP" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(view);
    const [, path, init] = backend.fetch.mock.calls[0];
    expect(path).toBe("/auth/me/deletion");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"scope":"ALL","via":"WEB"}');
  });

  it("POST refuses an unknown scope, bad JSON and an oversized body without calling the backend", async () => {
    expect((await post({ scope: "EVERYTHING" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect((await post("x".repeat(2049))).status).toBe(413);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [409, "ACCOUNT_DELETION_ALREADY_REQUESTED"],
    [403, "ACCOUNT_DELETION_SCOPE_NOT_ALLOWED"],
    [503, "ACCOUNT_DELETION_NOT_ENABLED"],
  ])("POST passes %i %s through", async (status, code) => {
    backend.fetch.mockResolvedValue(json({ code, message: "m", timestamp: "t" }, status));
    const response = await post({ scope: "CHEF" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  });

  it("POST answers 502 when the backend body fails the parser", async () => {
    backend.fetch.mockResolvedValue(json({ ok: true }, 201));
    const response = await post({ scope: "ALL" });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "INVALID_DELETION_RESPONSE" });
  });

  it("DELETE cancels through /auth/me/deletion", async () => {
    backend.fetch.mockResolvedValue(json({ ...view, status: "CANCELLED" }));
    const response = await DELETE(new NextRequest(url, { method: "DELETE", headers: { Origin: origin } }));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("CANCELLED");
    const [, path, init] = backend.fetch.mock.calls[0];
    expect(path).toBe("/auth/me/deletion");
    expect(init.method).toBe("DELETE");
  });

  it("DELETE from another origin is refused before the backend is called", async () => {
    const response = await DELETE(new NextRequest(url, { method: "DELETE", headers: { Origin: "https://untrusted.example" } }));
    expect(response.status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [404, "NO_DELETION_REQUEST"],
    [409, "ACCOUNT_DELETION_IN_PROGRESS"],
  ])("DELETE passes %i %s through", async (status, code) => {
    backend.fetch.mockResolvedValue(json({ code, message: "m", timestamp: "t" }, status));
    const response = await DELETE(new NextRequest(url, { method: "DELETE", headers: { Origin: origin } }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  });
});
