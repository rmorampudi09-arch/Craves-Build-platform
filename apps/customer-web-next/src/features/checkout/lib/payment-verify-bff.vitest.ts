// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({ ...await original<typeof import("@/shared/lib/server-api")>(), authenticatedApiFetch: upstream }));
import { POST } from "@/app/api/payments/orders/[paymentOrderId]/verify/route";

const paymentOrderId = "11111111-1111-4111-8111-111111111111";
const valid = { providerOrderId: "order_Nf3kLm9QwErTyU", providerPaymentId: "pay_Nf3kLm9QwErTyV", providerSignature: "a".repeat(64) };
const post = (body: unknown) => POST(new NextRequest(`https://craves.in/api/payments/orders/${paymentOrderId}/verify`, {
  method: "POST", headers: { "content-type": "application/json", origin: "https://craves.in", cookie: "craves_access_token=fixture" },
  body: JSON.stringify(body),
}), { params: Promise.resolve({ paymentOrderId }) });

beforeEach(() => upstream.mockReset());

it("forwards exactly the three Razorpay fields", async () => {
  upstream.mockResolvedValueOnce(Response.json({ paymentOrderId, status: "PAID", providerStatus: "captured", providerPaymentId: valid.providerPaymentId }));
  const response = await post({ ...valid, amount: 1, extra: { nested: true } });
  expect(response.status).toBe(200);
  expect(upstream.mock.calls[0][1]).toBe(`/payments/orders/${paymentOrderId}/verify`);
  expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(valid);
});

it.each([
  ["nothing", null],
  ["an array", [valid]],
  ["a foreign order id", { ...valid, providerOrderId: "sub_Nf3kLm9QwErTyU" }],
  ["a non-hex signature", { ...valid, providerSignature: "z".repeat(64) }],
  ["a missing payment id", { providerOrderId: valid.providerOrderId, providerSignature: valid.providerSignature }],
])("refuses %s before reaching the backend", async (_, body) => {
  const response = await post(body);
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("INVALID_PAYMENT_VERIFICATION");
  expect(upstream).not.toHaveBeenCalled();
});
