import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server-api")>(),
  authenticatedApiFetch: upstream,
}));
import { GET, PATCH, POST } from "@/app/api/admin/support/cases/[[...path]]/route";

const CASE = "6a1f2c3d-4b5e-4f60-8a7b-9c0d1e2f3a4b";
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const request = (method: string, url: string, body?: unknown) => new NextRequest(`https://admin.craves.in/api/admin/support/cases${url}`, {
  method,
  headers: { origin: "https://admin.craves.in", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe("admin support case BFF", () => {
  beforeEach(() => { upstream.mockReset(); upstream.mockResolvedValue(Response.json({ supportCase: { id: CASE } })); });

  it("rejects non-UUID case ids before calling the backend", async () => {
    expect((await GET(request("GET", "/case-1"), context("case-1"))).status).toBe(400);
    expect((await POST(request("POST", "/x/assign-to-me"), context("x", "assign-to-me"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards list filters and rejects unknown statuses", async () => {
    await GET(request("GET", "?status=OPEN&assignedToMe=true&cursor=abc"), context());
    expect(upstream.mock.calls[0][1]).toBe("/admin/support/cases?limit=50&assignedToMe=true&status=OPEN&cursor=abc");
    expect((await GET(request("GET", "?status=DELETED"), context())).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("forwards detail reads and validated actions", async () => {
    expect((await GET(request("GET", `/${CASE}`), context(CASE))).status).toBe(200);
    expect(upstream.mock.calls[0][1]).toBe(`/admin/support/cases/${CASE}`);

    await POST(request("POST", `/${CASE}/messages`, { message: " Refund issued ", internalNote: true }), context(CASE, "messages"));
    expect(upstream.mock.calls[1][1]).toBe(`/admin/support/cases/${CASE}/messages`);
    expect(JSON.parse(upstream.mock.calls[1][2].body)).toEqual({ message: "Refund issued", internalNote: true });

    await PATCH(request("PATCH", `/${CASE}/status`, { status: "RESOLVED" }), context(CASE, "status"));
    expect(upstream.mock.calls[2][2]).toMatchObject({ method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) });

    await POST(request("POST", `/${CASE}/assign-to-me`), context(CASE, "assign-to-me"));
    expect(upstream.mock.calls[3][1]).toBe(`/admin/support/cases/${CASE}/assign-to-me`);
    expect(upstream.mock.calls[3][2].body).toBeUndefined();
  });

  it("rejects unknown operations and invalid bodies", async () => {
    expect((await POST(request("POST", `/${CASE}/status`, { status: "OPEN" }), context(CASE, "status"))).status).toBe(404);
    expect((await PATCH(request("PATCH", `/${CASE}/status`, { status: "DELETED" }), context(CASE, "status"))).status).toBe(400);
    expect((await POST(request("POST", `/${CASE}/messages`, { message: "", internalNote: false }), context(CASE, "messages"))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
