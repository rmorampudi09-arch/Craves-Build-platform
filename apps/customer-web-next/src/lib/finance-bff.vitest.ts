import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-api", () => ({authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {}}));
import { financeProxy } from "./finance-bff";

describe("finance BFF safety", () => {
  beforeEach(() => upstream.mockReset());
  function request(origin: string, body: string, method = "POST") {
    return new NextRequest("https://craves.in/api/chef/finance/withdrawals", {method, headers: {origin, "Content-Type": "application/json"}, ...(method === "GET" ? {} : {body})});
  }
  it("rejects cross-origin withdrawal before calling upstream", async () => {
    expect((await financeProxy(request("https://attacker.invalid", "{}"), "chef", ["withdrawals"])).status).toBe(403);expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON before calling upstream", async () => {
    expect((await financeProxy(request("https://craves.in", "{"), "chef", ["withdrawals"])).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
  });
  it("bounds a monetary request body", async () => {
    expect((await financeProxy(request("https://craves.in", JSON.stringify({value: "a".repeat(70000)})), "chef", ["withdrawals"])).status).toBe(413);expect(upstream).not.toHaveBeenCalled();
  });
  it("does not expose another arbitrary upstream operation", async () => {
    expect((await financeProxy(request("https://craves.in", "{}"), "chef", ["policies"])).status).toBe(404);expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects malformed success rather than displaying fake available money", async () => {
    upstream.mockResolvedValue(Response.json({available: 343.17}));
    const response = await financeProxy(request("https://craves.in", "", "GET"), "chef", ["balance"]);
    expect(response.status).toBe(502);expect((await response.json()).code).toBe("INVALID_FINANCE_RESPONSE");
  });
  it("marks successful responses no-store and preserves decimal strings", async () => {
    upstream.mockResolvedValue(Response.json({id:"00112233-4455-4677-8899-aabbccddeeff", amount:"343.17", mode:"MANUAL", status:"RESERVED", providerStatus:null, transferReference:null, createdAt:"2026-09-14T00:00:00Z"}));
    const response = await financeProxy(request("https://craves.in", "{}"), "chef", ["withdrawals"]);
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect((await response.json()).amount).toBe("343.17");
  });
  it("checks delivery preview origin and schema without exposing provider internals", async () => {
    expect((await financeProxy(request("https://attacker.invalid", "{}"), "admin", ["delivery-preview"])).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(Response.json({distanceKm:"2.500",beforeTax:"25.00",gst:"4.50",total:"29.50",distanceBasis:"STRAIGHT_LINE",increment:"PRO_RATA",privateProviderField:"secret-test"}));
    const result=await financeProxy(request("https://craves.in", "{}"), "admin", ["delivery-preview"]);
    expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("no-store");expect(await result.json()).not.toHaveProperty("privateProviderField");
    upstream.mockResolvedValue(Response.json({total:29.5}));
    expect((await financeProxy(request("https://craves.in", "{}"), "admin", ["delivery-preview"])).status).toBe(502);
  });
});
