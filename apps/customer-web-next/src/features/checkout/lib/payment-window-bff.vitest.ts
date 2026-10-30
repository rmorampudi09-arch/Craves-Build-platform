// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { POST } from "@/app/api/payments/orders/route";

const identity = { id: "1d000000-0000-4000-8000-000000000001", phoneNumber: "+919000000000", status: "ACTIVE", roles: ["CUSTOMER"] };

beforeEach(() => upstream.mockReset());

it("turns the backend's 410 PAYMENT_WINDOW_EXPIRED into the timed-out checkout state", async () => {
  upstream
    .mockResolvedValueOnce(Response.json({ identity }))
    .mockResolvedValueOnce(Response.json({ status: 410, error: "Gone", message: "PAYMENT_WINDOW_EXPIRED" }, { status: 410 }));
  const body = JSON.stringify({ checkoutId: "11111111-1111-4111-8111-111111111111" });
  const response = await POST(new NextRequest("https://craves.in/api/payments/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(body.length), origin: "https://craves.in" },
    body,
  }));

  expect(upstream.mock.calls[1][1]).toBe("/payments/orders");
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({
    error: "PAYMENT_WINDOW_EXPIRED",
    message: "This checkout timed out. Review your order again to pay.",
  });
});
