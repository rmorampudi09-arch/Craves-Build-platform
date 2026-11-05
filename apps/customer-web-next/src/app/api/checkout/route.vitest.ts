// @vitest-environment node
// Synthetic ids; no backend is contacted.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { POST as createCheckout } from "@/app/api/checkout/route";
import { POST as createCheckoutOperation } from "@/app/api/checkout/operations/[operationId]/route";

const ADDRESS = "66666666-6666-4666-8666-666666666666";
const OPERATION = "77777777-7777-4777-8777-777777777777";
const PAUSED = { code: "ACCOUNT_DELETION_PENDING", message: "Your account is set to be deleted. Tap Keep my account to order again." };

function post(path: string, body: unknown) {
  const text = JSON.stringify(body);
  return new NextRequest(`https://craves.in${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(text.length), origin: "https://craves.in" },
    body: text,
  });
}

beforeEach(() => upstream.mockReset());

describe("checkout while an account deletion is open", () => {
  const start = () => createCheckout(post("/api/checkout", { deliveryAddressId: ADDRESS, note: null }));

  it("hands the client the deletion code with the 409, uncached", async () => {
    upstream.mockResolvedValueOnce(Response.json(PAUSED, { status: 409 }));
    const response = await start();
    expect([response.status, await response.json(), response.headers.get("cache-control")]).toEqual([
      409,
      { code: "ACCOUNT_DELETION_PENDING" },
      "no-store",
    ]);
  });

  it("leaves every other conflict as it was", async () => {
    upstream.mockResolvedValueOnce(Response.json({ error: "CART_CHANGED", message: "Your cart changed." }, { status: 409 }));
    const response = await start();
    expect([response.status, await response.json()]).toEqual([409, { error: "CART_CHANGED", message: "Your cart changed." }]);
  });

  it("does not take the deletion code from a refusal that is not a 409", async () => {
    upstream.mockResolvedValueOnce(Response.json(PAUSED, { status: 400 }));
    const response = await start();
    expect([response.status, (await response.json()).error]).toEqual([400, "CHECKOUT_FAILED"]);
  });
});

it("the checkout attempt route already carries the deletion code in error, which the checkout screen reads", async () => {
  upstream.mockResolvedValueOnce(Response.json(PAUSED, { status: 409 }));
  const response = await createCheckoutOperation(
    post(`/api/checkout/operations/${OPERATION}`, {
      deliveryAddressId: ADDRESS,
      note: null,
      expectedCart: { cartId: "88888888-8888-4888-8888-888888888888", items: [] },
    }),
    { params: Promise.resolve({ operationId: OPERATION }) },
  );
  expect([response.status, (await response.json()).error]).toEqual([409, "ACCOUNT_DELETION_PENDING"]);
});
