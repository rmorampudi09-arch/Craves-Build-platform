import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("./server-api", () => ({ authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {} }));
import { GET } from "../app/api/auth/email-verification/route";
import { POST as issue } from "../app/api/auth/email-verification/challenges/route";
import { POST as resend } from "../app/api/auth/email-verification/resend/route";
import { POST as verify } from "../app/api/auth/email-verification/verify/route";

const id = "11111111-1111-4111-8111-111111111111";
const state = { email: null, emailVerified: false, emailRevision: 0, pending: {
  challengeId: id, maskedEmail: "f***@example.invalid", expiresAt: "2026-09-14T10:10:00Z", resendAvailableAt: "2026-09-14T10:01:00Z", deliveryStatus: "ACCEPTED",
}, serverTime: "2026-09-14T10:00:00Z" };
function request(body?: unknown, options: { cookie?: boolean; origin?: string; raw?: string } = {}) {
  return new NextRequest("https://craves.in/api/auth/email-verification", {
    method: body === undefined && options.raw === undefined ? "GET" : "POST",
    headers: { ...(options.cookie === false ? {} : { cookie: "craves_access_token=fixture-token" }), origin: options.origin ?? "https://craves.in", "content-type": "application/json" },
    ...(body === undefined && options.raw === undefined ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
}
beforeEach(() => { upstream.mockReset(); });
describe("email verification BFF", () => {
  it("rejects anonymous lookup with no-store and without calling Auth", async () => {
    const response = await GET(request(undefined, { cookie: false }));
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toContain("no-store"); expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects cross-origin sends before consuming a provider operation", async () => {
    expect((await issue(request({ email: "fixture@example.invalid", requestId: id }, { origin: "https://other.invalid" }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("uses the cookie-bound Auth lookup and returns masked pending state", async () => {
    upstream.mockResolvedValue(Response.json(state));
    const response = await GET(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual(state);
    expect(upstream.mock.calls[0][1]).toBe("/auth/email-verification"); expect(upstream.mock.calls[0].slice(3)).toEqual([20000, 65536]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("preserves the canonical request ID and local-part case for an explicit issue", async () => {
    upstream.mockResolvedValue(Response.json(state, { status: 202 }));
    expect((await issue(request({ email: "  Fixture@example.invalid  ", requestId: id }))).status).toBe(202);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ email: "Fixture@example.invalid", requestId: id });
  });
  it("resends by owned challenge without accepting a full pending destination", async () => {
    upstream.mockResolvedValue(Response.json(state, { status: 202 }));
    expect((await resend(request({ challengeId: id, requestId: id }))).status).toBe(202);
    expect(upstream.mock.calls[0][1]).toBe("/auth/email-verification/resend");
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ challengeId: id, requestId: id });
  });
  for (const forged of [{ ownerId: id }, { identityId: id }, { emailVerified: true }, { fullAccountNumber: "fixture" }]) {
    it(`rejects an added ${Object.keys(forged)[0]} field`, async () => {
      expect((await issue(request({ email: "fixture@example.invalid", requestId: id, ...forged }))).status).toBe(400); expect(upstream).not.toHaveBeenCalled();
    });
  }
  for (const invalid of ["12345", "1234567", "12a456", 123456, " 123456"]) {
    it(`rejects malformed code ${typeof invalid}:${String(invalid).length}`, async () => {
      expect((await verify(request({ challengeId: id, code: invalid }))).status).toBe(400); expect(upstream).not.toHaveBeenCalled();
    });
  }
  it("bounds the actual body when Content-Length is absent", async () => {
    expect((await issue(request(undefined, { raw: " ".repeat(4097) }))).status).toBe(413); expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON", async () => {
    expect((await issue(request(undefined, { raw: "{" }))).status).toBe(400); expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    `{"email":"first@example.invalid","email":"second@example.invalid","requestId":"${id}"}`,
    `{"email":"first@example.invalid","em\\u0061il":"second@example.invalid","requestId":"${id}"}`,
    `{"email":"first@example.invalid","requestId":"${id}"} {}`,
  ])("rejects ambiguous JSON without forwarding it", async (raw) => {
    const response = await issue(request(undefined, { raw }));
    expect(response.status).toBe(400); expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("preserves a bounded retry-after without echoing upstream headers", async () => {
    upstream.mockResolvedValue(Response.json({ code: "EMAIL_VERIFICATION_RATE_LIMITED" }, {
      status: 429, headers: { "Retry-After": "60", "X-Provider-Detail": "private" },
    }));
    const response = await issue(request({ email: "fixture@example.invalid", requestId: id }));
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("x-provider-detail")).toBeNull();
  });
  it("returns safe owner denial without provider diagnostics", async () => {
    upstream.mockResolvedValue(Response.json({ code: "EMAIL_CODE_INVALID", message: "secret provider detail" }, { status: 400 }));
    const response = await verify(request({ challengeId: id, code: "000001" }));
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("secret provider"); expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("returns verified canonical email only after a valid successful receipt", async () => {
    const receipt = { ...state, email: "Fixture@example.invalid", emailVerified: true, emailRevision: 1, pending: null };
    upstream.mockResolvedValue(Response.json(receipt));
    const response = await verify(request({ challengeId: id, code: "000001" }));
    expect(await response.json()).toEqual(receipt);
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ challengeId: id, code: "000001" });
  });
  for (const invalid of [{ ...state, emailVerified: true }, { ...state, secret: "fixture" }, { ...state, pending: { ...state.pending, email: "full@example.invalid" } }, { ...state, emailRevision: -1 }]) {
    it("fails closed on an invalid or overexposing successful Auth receipt", async () => {
      upstream.mockResolvedValue(Response.json(invalid));
      const response = await GET(request()); expect(response.status).toBe(502); expect(await response.text()).not.toContain("fixture");
    });
  }
  it("rejects an unexpected success status", async () => {
    upstream.mockResolvedValue(Response.json(state));
    expect((await issue(request({ email: "fixture@example.invalid", requestId: id }))).status).toBe(502);
  });
  it("contains an upstream outage without echoing raw errors", async () => {
    upstream.mockRejectedValue(new Error("credential-like fixture"));
    const response = await GET(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("credential-like");
  });
  it("keeps the backend rate limit without exposing destination details", async () => {
    upstream.mockResolvedValue(Response.json({ code: "EMAIL_VERIFICATION_RATE_LIMITED", destination: "private@example.invalid" }, { status: 429 }));
    const response = await issue(request({ email: "fixture@example.invalid", requestId: id }));
    expect(response.status).toBe(429); expect(await response.text()).not.toContain("private@example.invalid");
  });
});
