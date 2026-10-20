import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", () => ({ authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {} }));
import { FLEET_ROUTES, fleetProxy } from "./fleet-bff";

const RIDER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const KEY = "99999999-9999-4999-8999-999999999999";
const document = { documentId: DOC, type: "PAN", status: "REJECTED", expiresOn: null, reason: "Blurred photo", reviewedBy: "Asha", reviewedAt: "2026-10-20T06:30:00Z", uploadedAt: "2026-10-19T06:30:00Z" };

function request(path: string, init: { method?: string; body?: unknown; origin?: string; key?: string | null } = {}) {
  const headers: Record<string, string> = { origin: init.origin ?? "https://admin.craves.in" };
  if (init.key !== null) headers["idempotency-key"] = init.key ?? KEY;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`https://admin.craves.in/api/admin/fleet/${path}`, {
    method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const segments = (path: string) => path.split("?")[0].split("/");

describe("admin fleet BFF", () => {
  beforeEach(() => upstream.mockReset());

  it("forwards only listed operations with UUID ids", async () => {
    for (const [method, path] of [["GET", "riders/not-a-uuid"], ["DELETE", `riders/${RIDER}`], ["GET", "riders/../secrets"], ["POST", `riders/${RIDER}/documents/${DOC}/delete`]]) {
      const response = await fleetProxy(request(path, { method }), segments(path));
      expect(response.status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards only known filters", async () => {
    expect((await fleetProxy(request("riders?status=BLOCKED"), ["riders"])).status).toBe(400);
    expect((await fleetProxy(request("riders?sort=name"), ["riders"])).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json({ riders: [], nextCursor: null }));
    expect((await fleetProxy(request("riders?status=ACTIVE&search=98"), ["riders"])).status).toBe(200);
    expect(upstream.mock.calls[0][1]).toBe("/admin/fleet/riders?status=ACTIVE&search=98");
  });

  it("refuses a cross-site action or one without an idempotency key", async () => {
    const path = `riders/${RIDER}/documents/${DOC}/approve`;
    expect((await fleetProxy(request(path, { method: "POST", origin: "https://evil.example" }), segments(path))).status).toBe(403);
    const missing = await fleetProxy(request(path, { method: "POST", key: null }), segments(path));
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("validates the body, drops unknown fields and forwards the idempotency key", async () => {
    const path = `riders/${RIDER}/documents/${DOC}/reject`;
    const empty = await fleetProxy(request(path, { method: "POST", body: { reason: " " } }), segments(path));
    expect(empty.status).toBe(400);
    expect((await empty.json()).message).toBe("Write a reason of at least 3 characters.");
    upstream.mockResolvedValue(Response.json({ ...document, blobName: "kyc/private.pdf" }));
    const response = await fleetProxy(request(path, { method: "POST", body: { reason: "Blurred photo", status: "VERIFIED" } }), segments(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(document);
    const [, upstreamPath, init] = upstream.mock.calls[0];
    expect(upstreamPath).toBe(`/admin/fleet/${path}`);
    expect(init.headers).toEqual({ "Idempotency-Key": KEY, "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ reason: "Blurred photo" });
  });

  it("passes the server's code and message through", async () => {
    upstream.mockResolvedValue(Response.json({ code: "HOLDER_NAME_MISMATCH", message: "The holder name is not the KYC name RAVI KUMAR." }, { status: 422 }));
    const path = `riders/${RIDER}/payout-account`;
    const response = await fleetProxy(request(path, { method: "PUT", body: { method: "UPI", upiId: "ravi@okaxis", holderName: "R KUMAR", verifiedInPerson: true } }), segments(path));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "HOLDER_NAME_MISMATCH", message: "The holder name is not the KYC name RAVI KUMAR." });
  });

  it("gives a plain message when the server sends none, and refuses an unexpected success", async () => {
    upstream.mockResolvedValue(new Response("<html>", { status: 403 }));
    const denied = await fleetProxy(request(`riders/${RIDER}`), ["riders", RIDER]);
    expect(await denied.json()).toEqual({ code: "FLEET_REQUEST_FAILED", message: "Your admin role can't do this." });
    upstream.mockResolvedValue(Response.json({ rider: null }));
    expect((await fleetProxy(request(`riders/${RIDER}`), ["riders", RIDER])).status).toBe(502);
  });

  it("refuses a reassign to two couriers before it reaches the server", async () => {
    const path = `trips/${RIDER}/reassign`;
    const response = await fleetProxy(request(path, { method: "POST", body: { riderId: DOC, provider: "BORZO", reason: "Faster" } }), segments(path));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Choose one new courier: a rider, Borzo or Pidge.");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("downloads the joins and exits CSV as an attachment", async () => {
    upstream.mockResolvedValue(new Response("date,riderId\n", { headers: { "content-type": "text/csv; charset=utf-8" } }));
    const response = await fleetProxy(request("exports/rider-joins-exits?date=2026-10-19"), ["exports", "rider-joins-exits"]);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="rider-joins-exits-2026-10-19.csv"');
    expect(await response.text()).toBe("date,riderId\n");
    upstream.mockResolvedValue(new Response("<script>", { headers: { "content-type": "text/html" } }));
    expect((await fleetProxy(request("exports/rider-joins-exits?date=2026-10-19"), ["exports", "rider-joins-exits"])).status).toBe(502);
  });

  it("forwards only paths and methods that are in the admin fleet contract", () => {
    const yaml = readFileSync(new URL("../../../../../../../contracts/openapi/admin-fleet-v1.yaml", import.meta.url), "utf8");
    const operations = new Set<string>();
    let path = "";
    for (const line of yaml.split("\n")) {
      const pathMatch = /^ {2}\/api\/v1\/admin\/fleet\/(\S+):$/.exec(line);
      if (pathMatch) path = pathMatch[1].replace(/\{[^}]+\}/g, ":id");
      const method = /^ {4}(get|post|put):$/.exec(line);
      if (method) operations.add(`${method[1].toUpperCase()} ${path}`);
    }
    for (const route of FLEET_ROUTES) expect(operations, `${route.method} ${route.path}`).toContain(`${route.method} ${route.path}`);
  });
});
