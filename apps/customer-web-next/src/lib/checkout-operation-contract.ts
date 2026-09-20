import type { CustomerCart } from "./cart-contract.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutCartSnapshot = {
  cartId: string;
  items: Array<{
    id: string;
    quantity: number;
    updatedAt: string;
  }>;
};

export type CheckoutOperationRequest = {
  deliveryAddressId: string;
  note: string | null;
  expectedCart: CheckoutCartSnapshot;
};

export type CheckoutOperationResponse = {
  operationId: string;
  status: "SUCCEEDED";
  checkoutId: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

export function checkoutCartSnapshot(cart: CustomerCart): CheckoutCartSnapshot {
  return {
    cartId: cart.id,
    items: cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      updatedAt: item.updatedAt,
    })),
  };
}

export function parseCheckoutOperationRequest(
  value: unknown,
): CheckoutOperationRequest | null {
  const raw = record(value);
  if (!raw) return null;
  const deliveryAddressId = text(raw.deliveryAddressId, 64);
  const note =
    raw.note == null
      ? null
      : typeof raw.note === "string"
        ? raw.note.trim() || null
        : null;
  if (!deliveryAddressId || !UUID.test(deliveryAddressId)) return null;
  if (note && note.length > 2000) return null;

  const expected = record(raw.expectedCart);
  const cartId = expected ? text(expected.cartId, 64) : null;
  const rawItems = expected?.items;
  if (!cartId || !UUID.test(cartId) || !Array.isArray(rawItems)) return null;
  if (rawItems.length > 200) return null;

  const items: CheckoutCartSnapshot["items"] = [];
  for (const value of rawItems) {
    const item = record(value);
    if (!item) return null;
    const id = text(item.id, 64);
    const quantity = item.quantity;
    const updatedAt = text(item.updatedAt, 64);
    if (
      !id ||
      !UUID.test(id) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100 ||
      !updatedAt ||
      Number.isNaN(Date.parse(updatedAt))
    ) {
      return null;
    }
    items.push({ id, quantity, updatedAt });
  }

  return {
    deliveryAddressId,
    note,
    expectedCart: { cartId, items },
  };
}

export function parseCheckoutOperationResponse(
  value: unknown,
): CheckoutOperationResponse | null {
  const raw = record(value);
  if (!raw) return null;
  const operationId = text(raw.operationId, 64);
  const checkoutId = text(raw.checkoutId, 64);
  return operationId &&
    checkoutId &&
    UUID.test(operationId) &&
    UUID.test(checkoutId) &&
    raw.status === "SUCCEEDED"
    ? { operationId, status: "SUCCEEDED", checkoutId }
    : null;
}
