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

  it("downloads a payout bank file and passes a same-approver refusal through", async () => {
    upstream.mockResolvedValue(new Response("payoutId,amount\n", { headers: { "content-type": "text/csv" } }));
    const file = await fleetProxy(request(`payout-batches/${RIDER}/file`), ["payout-batches", RIDER, "file"]);
    expect(file.headers.get("content-disposition")).toBe(`attachment; filename="rider-payouts-${RIDER}.csv"`);
    upstream.mockResolvedValue(Response.json({ code: "SAME_APPROVER", message: "Another payments admin must approve this batch." }, { status: 403 }));
    const path = `payout-batches/${RIDER}/approve`;
    const refused = await fleetProxy(request(path, { method: "POST" }), segments(path));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ code: "SAME_APPROVER", message: "Another payments admin must approve this batch." });
    expect(upstream.mock.calls[1][2].headers).toEqual({ "Idempotency-Key": KEY });
  });

  it("never passes a role refusal's own text to the browser", async () => {
    upstream.mockResolvedValue(Response.json({ code: "FORBIDDEN", message: "OPERATIONS_ADMIN is required" }, { status: 403 }));
    const path = `riders/${RIDER}/vehicle`;
    const refused = await fleetProxy(request(path, { method: "PUT", body: { label: "Honda Activa 6G", regNumber: "TS09EA1234" } }), segments(path));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ code: "FORBIDDEN", message: "Your admin role can't do this." });
  });

  it("approves a document with or without an expiry date", async () => {
    upstream.mockImplementation(async () => Response.json({ ...document, type: "PUC", status: "VERIFIED", reason: null, expiresOn: "2027-04-30" }));
    const path = `riders/${RIDER}/documents/${DOC}/approve`;
    expect((await fleetProxy(request(path, { method: "POST", body: { expiresOn: "30/04/2027" } }), segments(path))).status).toBe(400);
    expect((await fleetProxy(request(path, { method: "POST", body: { expiresOn: "2027-04-30", status: "REJECTED" } }), segments(path))).status).toBe(200);
    expect(upstream.mock.calls[0][2].headers).toEqual({ "Idempotency-Key": KEY, "Content-Type": "application/json" });
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual({ expiresOn: "2027-04-30" });
    expect((await fleetProxy(request(path, { method: "POST" }), segments(path))).status).toBe(200);
    expect(upstream.mock.calls[1][2]).toEqual({ method: "POST", headers: { "Idempotency-Key": KEY } });
  });

  it("checks a vehicle, a slot and a banner before they reach the server", async () => {
    const cases: [string, string, unknown, string][] = [
      ["PUT", `riders/${RIDER}/vehicle`, { label: "Honda Activa 6G", regNumber: "ts 09 ea 1234" }, "Enter the registration number, like TS09EA1234."],
      ["POST", "slots", { riderId: RIDER, zoneName: "Madhapur", startsAt: "2026-10-21T12:30:00Z", endsAt: "2026-10-21T08:30:00Z", guaranteedPerHourPaise: 8000 }, "The slot must end after it starts."],
      ["POST", "slots", { riderId: RIDER, zoneName: "Madhapur", startsAt: "2026-10-21T08:30:00Z", endsAt: "2026-10-21T12:30:00Z", guaranteedPerHourPaise: 80.5 }, "Expected integer, received float"],
      ["POST", `slots/${DOC}/cancel`, { reason: "" }, "Write a reason of at least 3 characters."],
      ["PUT", "banner", { tone: "danger", text: "Rain", until: "2026-10-21T12:30:00Z" }, "Invalid enum value. Expected 'info' | 'warning', received 'danger'"],
      ["PUT", "banner", { tone: "warning", text: "x".repeat(161), until: "2026-10-21T12:30:00Z" }, "Keep the banner to 160 characters."],
    ];
    for (const [method, path, body, message] of cases) {
      const response = await fleetProxy(request(path, { method, body }), segments(path));
      expect(response.status, path).toBe(400);
      expect((await response.json()).message, path).toBe(message);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("lists slots by date range and rider only", async () => {
    expect((await fleetProxy(request("slots?from=2026-10-21&to=tomorrow"), ["slots"])).status).toBe(400);
    expect((await fleetProxy(request("slots?from=2026-10-21&zone=Madhapur"), ["slots"])).status).toBe(400);
    upstream.mockResolvedValue(Response.json({ slots: [] }));
    expect((await fleetProxy(request(`slots?from=2026-10-21&to=2026-10-27&riderId=${RIDER}`), ["slots"])).status).toBe(200);
    expect(upstream.mock.calls[0][1]).toBe(`/admin/fleet/slots?from=2026-10-21&to=2026-10-27&riderId=${RIDER}`);
  });

  it("answers 204 when no banner is showing and when the banner is cleared", async () => {
    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    const none = await fleetProxy(request("banner"), ["banner"]);
    expect(none.status).toBe(204);
    expect(await none.text()).toBe("");
    const cleared = await fleetProxy(request("banner", { method: "DELETE" }), ["banner"]);
    expect(cleared.status).toBe(204);
    expect(upstream.mock.calls[1][2]).toEqual({ method: "DELETE", headers: { "Idempotency-Key": KEY } });
    expect((await fleetProxy(request("banner", { method: "DELETE", key: null }), ["banner"])).status).toBe(400);
    // 204 means "nothing" only where the contract says so.
    const path = `slots/${DOC}/cancel`;
    expect((await fleetProxy(request(path, { method: "POST", body: { reason: "Rider is unwell" } }), segments(path))).status).toBe(502);
  });

  it("publishes a rate card only by a version-shaped path, and removes pilot entries with 204", async () => {
    for (const version of ["latest", "2026-10", "2026-10-v1x", "..%2Fsetup"]) {
      expect((await fleetProxy(request(`rate-cards/${version}/publish`, { method: "POST" }), ["rate-cards", version, "publish"])).status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json({ code: "VERSION_REFUSED", message: "It must start on or after 5 Nov 2026." }, { status: 422 }));
    const refused = await fleetProxy(request("rate-cards/2026-10-v2/publish", { method: "POST" }), ["rate-cards", "2026-10-v2", "publish"]);
    expect(await refused.json()).toEqual({ code: "VERSION_REFUSED", message: "It must start on or after 5 Nov 2026." });
    expect(upstream.mock.calls[0].slice(1, 3)).toEqual(["/admin/fleet/rate-cards/2026-10-v2/publish", { method: "POST", headers: { "Idempotency-Key": KEY } }]);

    upstream.mockResolvedValue(new Response(null, { status: 204 }));
    const removed = await fleetProxy(request(`pilot/riders/${RIDER}`, { method: "DELETE" }), ["pilot", "riders", RIDER]);
    expect(removed.status).toBe(204);
    expect((await fleetProxy(request(`pilot/kitchens/${DOC}`, { method: "DELETE" }), ["pilot", "kitchens", DOC])).status).toBe(204);
    // A 204 is not a pilot rider.
    expect((await fleetProxy(request(`pilot/riders/${RIDER}`, { method: "PUT" }), ["pilot", "riders", RIDER])).status).toBe(502);
    expect((await fleetProxy(request(`pilot/kitchens/${DOC}`, { method: "PUT", body: { note: "x".repeat(201) } }), ["pilot", "kitchens", DOC])).status).toBe(400);
  });

  it("forwards only paths and methods that are in the admin fleet contract", () => {
    const yaml = readFileSync(new URL("../../../../../../../contracts/openapi/admin-fleet-v1.yaml", import.meta.url), "utf8");
    const operations = new Set<string>();
    let path = "";
    for (const line of yaml.split("\n")) {
      const pathMatch = /^ {2}\/api\/v1\/admin\/fleet\/(\S+):$/.exec(line);
      if (pathMatch) path = pathMatch[1].replace("{version}", ":version").replace(/\{[^}]+\}/g, ":id");
      const method = /^ {4}(get|post|put|delete):$/.exec(line);
      if (method) operations.add(`${method[1].toUpperCase()} ${path}`);
    }
    for (const route of FLEET_ROUTES) expect(operations, `${route.method} ${route.path}`).toContain(`${route.method} ${route.path}`);
  });
});
