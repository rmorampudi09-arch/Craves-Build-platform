import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", () => ({
  authenticatedApiFetch: upstream,
  SessionRequiredError: class extends Error {},
  isUuid: (value: string) => /^[0-9a-f-]{36}$/.test(value),
}));
import { GET, POST } from "@/app/api/customer/addresses/route";
import { PUT } from "@/app/api/customer/addresses/[addressId]/route";

const input = {
  addressLabel: "Mom's House", recipientName: "Test Customer", contactPhoneNumber: "+919876543210",
  addressLine1: "Flat 101", addressLine2: null, landmark: null, areaName: "Madhapur",
  districtName: "Hyderabad", city: "Hyderabad", state: "Telangana", postalCode: "500081",
  latitude: 17.4483, longitude: 78.3915, isDefault: false,
};
const saved = {
  ...input, id: "11111111-1111-4111-8111-111111111111", active: true,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  identityId: "22222222-2222-4222-8222-222222222222",
};
function request(method: string, body: unknown, origin = "https://craves.in") {
  return new NextRequest("https://craves.in/api/customer/addresses", {
    method, headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("custom address label through the web API", () => {
  beforeEach(() => upstream.mockReset());

  it("creates, reloads and makes a custom address default without losing its name", async () => {
    upstream.mockResolvedValueOnce(Response.json(saved));
    const created = await POST(request("POST", { ...input, addressLabel: "  Mom's House  ", identityId: "caller-supplied", addressName: "obsolete" }));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect(await created.json()).toMatchObject({ addressLabel: "Mom's House" });
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(input);

    upstream.mockResolvedValueOnce(Response.json([saved]));
    const loaded = await GET(new NextRequest("https://craves.in/api/customer/addresses"));
    const addresses = await loaded.json();
    expect(addresses[0].addressLabel).toBe("Mom's House");
    expect(addresses[0]).not.toHaveProperty("identityId");

    upstream.mockResolvedValueOnce(Response.json({ ...saved, isDefault: true }));
    const updated = await PUT(request("PUT", { ...input, isDefault: true }), { params: Promise.resolve({ addressId: saved.id }) });
    expect(updated.status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[2][2].body)).toEqual({ ...input, isDefault: true });
    expect(await updated.json()).toMatchObject({ addressLabel: "Mom's House", isDefault: true });
  });

  it.each([null, "", "   ", "x".repeat(81)])("rejects invalid labels before calling the backend", async addressLabel => {
    expect((await POST(request("POST", { ...input, addressLabel }))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("retains the same-origin protection", async () => {
    expect((await POST(request("POST", input, "https://other.invalid"))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});
