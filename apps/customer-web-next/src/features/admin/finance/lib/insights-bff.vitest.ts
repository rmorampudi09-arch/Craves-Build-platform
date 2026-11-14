import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {} }));
import { SessionRequiredError } from "@/shared/lib/server-api";
import { GET } from "@/app/api/admin/finance/insights/route";

const ID = "0bde0000-1111-4222-8333-444455556666";
const read = (query: string) => GET(new NextRequest(`https://admin.craves.in/api/admin/finance/insights?${query}`));
const chefs = { generatedAt: "2026-11-14T03:00:00Z", payoutMode: "CRAVES_MANUAL",
  position: { readyToPay: "7420.50", onHold: "0.00", notYetDue: "0.00", inProgress: "0.00", chefsToPay: 1, chefsOnHold: 0 },
  chefs: [{ chefId: ID, orders: 86, due: "7420.50", notYetDue: "0.00", inProgress: "0.00", paid: "58240.00", lastPaidAt: null, onHold: false, holdReason: null }] };

describe("finance insights BFF", () => {
  // Braces matter: vitest runs a function returned from beforeEach as its cleanup, and mockReset returns the mock.
  beforeEach(() => { upstream.mockReset(); });
  it("refuses a query it does not know without calling the backend", async () => {
    for (const query of ["", "view=policies", `view=order&id=${ID}&view=chefs`, "view=transactions&search=%27%20OR%201%3D1", "view=payout&id=..%2F..%2Fpolicies"]) {
      const response = await read(query);
      expect(response.status, query).toBe(400); expect((await response.json()).code).toBe("INVALID_FINANCE_QUERY");
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("reads exactly the asked view and never caches money", async () => {
    upstream.mockResolvedValue(Response.json(chefs));
    const response = await read("view=chefs");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(upstream).toHaveBeenCalledTimes(1); expect(upstream.mock.calls[0][1]).toBe("/admin/finance/insights/chefs");
    expect((await response.json()).chefs[0].due).toBe("7420.50");
    upstream.mockResolvedValue(Response.json({}, { status: 404 }));
    await read(`view=order&id=${ID}`);
    expect(upstream.mock.calls[1][1]).toBe(`/admin/finance/insights/orders/${ID}`);
  });
  it("passes on only the fields the screens use", async () => {
    upstream.mockResolvedValue(Response.json({ ...chefs, internalNote: "private", chefs: [{ ...chefs.chefs[0], bankAccountNumber: "000111222333" }] }));
    const text = JSON.stringify(await (await read("view=chefs")).json());
    expect(text).not.toContain("private"); expect(text).not.toContain("000111222333");
  });
  it("shows a wrong-shaped answer as a failure, never as money", async () => {
    upstream.mockResolvedValue(Response.json({ ...chefs, position: { ...chefs.position, readyToPay: 7420.5 } }));
    const response = await read("view=chefs");
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ code: "INVALID_FINANCE_RESPONSE" });
    upstream.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    expect((await read("view=chefs")).status).toBe(502);
  });
  it("names why a read was refused without repeating the backend's words", async () => {
    for (const [status, code] of [[401, "SESSION_EXPIRED"], [403, "FINANCE_ROLE_REQUIRED"], [404, "FINANCE_RECORD_NOT_FOUND"], [500, "FINANCE_READ_REJECTED"]] as const) {
      upstream.mockResolvedValue(Response.json({ detail: "payment_schema.finance_payable is private" }, { status }));
      const response = await read(`view=payout&id=${ID}`);
      expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
    }
  });
  it("asks for sign-in when the session is gone and says unavailable when the backend cannot be reached", async () => {
    upstream.mockRejectedValue(new SessionRequiredError("no session"));
    expect((await read("view=overview")).status).toBe(401);
    upstream.mockRejectedValue(new Error("connect ETIMEDOUT 10.0.0.4"));
    const response = await read("view=overview");
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ code: "FINANCE_UNAVAILABLE" });
  });
});
