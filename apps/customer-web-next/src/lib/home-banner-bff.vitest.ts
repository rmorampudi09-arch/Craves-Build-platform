import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/server-api", () => ({ authenticatedApiFetch: backend.fetch, SessionRequiredError: class extends Error {} }));
import { DELETE, GET, POST, PUT } from "@/app/api/admin/banners/[[...path]]/route";
const origin = "https://admin.craves.in";
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const id = "6212c931-b8ac-4cc7-8cf6-3a9672046b11";
describe("home banner admin BFF", () => {
  beforeEach(() => { backend.fetch.mockReset(); });
  it("does not permit cross-origin mutations", async () => {
    const response = await POST(new NextRequest(`${origin}/api/admin/banners`, { method: "POST", headers: { Origin: "https://untrusted.example" }, body: "x" }), context());
    expect(response.status).toBe(403); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it("only forwards an allowlisted banner route", async () => {
    expect((await GET(new NextRequest(`${origin}/api/admin/banners`), context(["..", "auth"]))).status).toBe(404);
    expect(backend.fetch).not.toHaveBeenCalled();
    backend.fetch.mockResolvedValue(Response.json([]));
    const response = await GET(new NextRequest(`${origin}/api/admin/banners`), context());
    expect(response.status).toBe(200); expect(backend.fetch.mock.calls[0][1]).toBe("/catalog/admin/banners");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("preserves backend denials and never pretends upload succeeded", async () => {
    backend.fetch.mockResolvedValue(new Response("private upstream message", { status: 403 }));
    const response = await GET(new NextRequest(`${origin}/api/admin/banners`), context());
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("private upstream message");
  });
  it("requires JSON and a current optimistic version for updates", async () => {
    const response = await PUT(new NextRequest(`${origin}/api/admin/banners/${id}`, { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Craves", sortOrder: 0, published: true }) }), context([id]));
    expect(response.status).toBe(400); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it("forwards validated fields without accepting extra properties", async () => {
    backend.fetch.mockResolvedValue(Response.json({ id }));
    const update = { label: "Craves", sortOrder: 0, published: true, expectedUpdatedAt: new Date().toISOString() };
    const response = await PUT(new NextRequest(`${origin}/api/admin/banners/${id}`, { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(update) }), context([id]));
    expect(response.status).toBe(200); expect(JSON.parse(backend.fetch.mock.calls[0][2].body)).toEqual(update);
  });
  it("bounds chunked request bodies", async () => {
    const response = await PUT(new NextRequest(`${origin}/api/admin/banners/${id}`, { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: "x".repeat(4097) }), context([id]));
    expect(response.status).toBe(413); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it("forwards a same-origin delete and refuses a cross-origin one", async () => {
    expect((await DELETE(new NextRequest(`${origin}/api/admin/banners/${id}`, { method: "DELETE", headers: { Origin: "https://untrusted.example" } }), context([id]))).status).toBe(403);
    expect(backend.fetch).not.toHaveBeenCalled();
    backend.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await DELETE(new NextRequest(`${origin}/api/admin/banners/${id}`, { method: "DELETE", headers: { Origin: origin } }), context([id]));
    expect(response.status).toBe(204);
    expect(backend.fetch.mock.calls[0][1]).toBe(`/catalog/admin/banners/${id}`);
    expect(backend.fetch.mock.calls[0][2].method).toBe("DELETE");
  });
  it("rejects unsupported upload formats before forwarding", async () => {
    const body = new FormData(); body.set("label", "Craves"); body.set("sortOrder", "0"); body.set("file", new File(["<svg/>"], "banner.svg", { type: "image/svg+xml" }));
    const response = await POST(new NextRequest(`${origin}/api/admin/banners`, { method: "POST", headers: { Origin: origin }, body }), context());
    expect(response.status).toBe(400); expect(backend.fetch).not.toHaveBeenCalled();
  });
});
