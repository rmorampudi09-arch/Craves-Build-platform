import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-api", () => ({authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {}}));
import { POST } from "@/app/api/admin/finance/payouts/[id]/reconcile/route";
const id = "00112233-4455-4677-8899-aabbccddeeff";
const payload = {providerPayoutId: "pout_original", reason: "Verified original transfer evidence"};
function request(body: unknown = payload, origin = "https://craves.in") {
  return new NextRequest(`https://craves.in/api/admin/finance/payouts/${id}/reconcile`, {
    method: "POST", headers: {origin, "Content-Type": "application/json"}, body: JSON.stringify(body),
  });
}
const context = () => ({params: Promise.resolve({id})});
describe("existing payout recovery proxy", () => {
  beforeEach(() => upstream.mockReset());
  it("rejects cross-origin recovery", async () => {
    expect((await POST(request(payload, "https://attacker.invalid"), context())).status).toBe(403);expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects arbitrary provider paths or missing evidence", async () => {
    expect((await POST(request({providerPayoutId: "../payouts", reason: ""}), context())).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
  });
  it("does not accept another instruction in a success response", async () => {
    upstream.mockResolvedValue(Response.json({instructionId: "10112233-4455-4677-8899-aabbccddeeff", status: "PAID", providerStatus: "processed", notice: "other"}));
    expect((await POST(request(), context())).status).toBe(502);
  });
  it("does not accept invented transfer status", async () => {
    upstream.mockResolvedValue(Response.json({instructionId: id, status: "SUCCESS", providerStatus: "processed", notice: ""}));
    expect((await POST(request(), context())).status).toBe(502);
  });
  it("returns a no-store result for the selected instruction", async () => {
    upstream.mockResolvedValue(Response.json({instructionId: id, status: "REVERSED", providerStatus: "reversed", notice: "Linked reversal recorded; chef held"}));
    const response = await POST(request(), context());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).status).toBe("REVERSED");expect(upstream.mock.calls[0][1]).toBe(`/admin/finance/payouts/${id}/reconcile`);
  });
  it("does not turn provider errors into success", async () => {
    upstream.mockResolvedValue(Response.json({detail: "private upstream details"}, {status: 409}));
    const response = await POST(request(), context());expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain("private");
  });
});
