import assert from "node:assert/strict";
import test from "node:test";
import { parseChefOrder, parseChefOrders } from "./chef-order-contract.ts";

const order = {
  id: "11111111-2222-4333-8444-555555555555",
  checkoutId: "21111111-2222-4333-8444-555555555555",
  customerIdentityId: "31111111-2222-4333-8444-555555555555",
  kitchenId: "41111111-2222-4333-8444-555555555555",
  kitchenName: "Home Kitchen",
  status: "CHEF_ACCEPTANCE_PENDING",
  currency: "INR",
  foodSubtotal: 250,
  platformFee: 10,
  taxAmount: 12,
  deliveryFee: 30,
  grandTotal: 302,
  chefResponseNote: null,
  prepTimeMinutes: null,
  pickupAddress: { addressLine1: "private pickup" },
  deliveryAddress: { recipientName: "Customer", contactPhoneNumber: "+919999999999", addressLine1: "1 Test Road", city: "Hyderabad", state: "Telangana", postalCode: "500001" },
  items: [{ id: "51111111-2222-4333-8444-555555555555", menuItemId: "61111111-2222-4333-8444-555555555555", itemName: "Meal", category: "Lunch", foodType: "VEG", unitPrice: 250, quantity: 1, lineTotal: 250 }],
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z"
};

test("keeps fulfillment address but removes identity/internal fields", () => {
  const parsed = parseChefOrder(order);
  assert.equal(parsed?.deliveryAddress?.contactPhoneNumber, "+919999999999");
  assert.equal("customerIdentityId" in (parsed ?? {}), false);
  assert.equal("checkoutId" in (parsed ?? {}), false);
  assert.equal("kitchenId" in (parsed ?? {}), false);
  assert.equal("pickupAddress" in (parsed ?? {}), false);
});

test("rejects unknown order status and invalid ids", () => {
  assert.equal(parseChefOrder({ ...order, status: "PROVIDER_INTERNAL" }), null);
  assert.equal(parseChefOrder({ ...order, id: "bad" }), null);
});

test("validates complete chef order arrays", () => {
  assert.equal(parseChefOrders([order])?.length, 1);
  assert.equal(parseChefOrders([order, { ...order, id: "bad" }]), null);
});
