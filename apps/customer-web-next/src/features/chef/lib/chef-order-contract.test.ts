import assert from "node:assert/strict";
import test from "node:test";
import {
  isCanonicalUuid,
  isChefOrderStatus,
  parseChefOrder,
  parseChefOrderHistoryPage,
  parseChefOrderResponse,
  parseChefOrders,
  parseChefOrdersResponse,
} from "./chef-order-contract.ts";

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
  deliveryAddress: {
    recipientName: "Customer",
    contactPhoneNumber: "+919999999999",
    addressLine1: "1 Test Road",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500001",
  },
  items: [
    {
      id: "51111111-2222-4333-8444-555555555555",
      menuItemId: "61111111-2222-4333-8444-555555555555",
      itemName: "Meal",
      category: "Lunch",
      foodType: "VEG",
      unitPrice: 250,
      quantity: 1,
      lineTotal: 250,
    },
  ],
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z",
};

test("keeps fulfillment address but removes identity/internal fields", () => {
  const parsed = parseChefOrder(order);
  assert.equal(parsed?.deliveryAddress?.contactPhoneNumber, "+919999999999");
  assert.equal("customerIdentityId" in (parsed ?? {}), false);
  assert.equal("kitchenId" in (parsed ?? {}), false);
  assert.equal("pickupAddress" in (parsed ?? {}), false);
});

test("keeps the checkout (none for a meal-plan order) and the response deadline", () => {
  assert.equal(parseChefOrder(order)?.checkoutId, order.checkoutId);
  assert.equal(parseChefOrder({ ...order, checkoutId: null })?.checkoutId, null);
  assert.equal(parseChefOrder({ ...order, checkoutId: "bad" })?.checkoutId, null);
  assert.equal(parseChefOrder(order)?.chefAcceptanceExpiresAt, null);
  assert.equal(parseChefOrder({ ...order, chefAcceptanceExpiresAt: "2026-07-30T00:10:00Z" })?.chefAcceptanceExpiresAt, "2026-07-30T00:10:00Z");
  assert.equal(parseChefOrder({ ...order, chefAcceptanceExpiresAt: "soon" })?.chefAcceptanceExpiresAt, null);
});

test("keeps the delivery partner with an https photo only, and tells a missing hand-over apart from one still to do", () => {
  const partner = { name: "Ravi", phone: "+919888888888", photoUrl: "https://cdn.craves.in/p.jpg", pickupEtaAt: "2026-07-30T00:20:00Z" };
  assert.deepEqual(parseChefOrder({ ...order, deliveryPartner: partner })?.deliveryPartner, partner);
  assert.equal(parseChefOrder({ ...order, deliveryPartner: { ...partner, photoUrl: "http://cdn.craves.in/p.jpg" } })?.deliveryPartner?.photoUrl, null);
  assert.equal(parseChefOrder({ ...order, deliveryPartner: { ...partner, photoUrl: "javascript:alert(1)" } })?.deliveryPartner?.photoUrl, null);
  assert.deepEqual(parseChefOrder({ ...order, deliveryPartner: {} })?.deliveryPartner, { name: null, phone: null, photoUrl: null, pickupEtaAt: null });
  assert.equal(parseChefOrder(order)?.deliveryPartner, null);
  assert.equal("chefHandedOverAt" in (parseChefOrder(order) ?? {}), false);
  assert.equal(parseChefOrder({ ...order, chefHandedOverAt: null })?.chefHandedOverAt, null);
  assert.equal(parseChefOrder({ ...order, chefHandedOverAt: "2026-07-30T00:30:00Z" })?.chefHandedOverAt, "2026-07-30T00:30:00Z");
  assert.equal("chefHandedOverAt" in (parseChefOrder({ ...order, chefHandedOverAt: "later" }) ?? {}), false);
});

test("accepts canonical PostgreSQL UUIDs regardless of RFC version bits", () => {
  const historical = {
    ...order,
    id: "20000000-0000-0000-0000-000000000001",
    items: [
      {
        ...order.items[0],
        id: "30000000-0000-0000-0000-000000000001",
        menuItemId: "40000000-0000-0000-0000-000000000001",
      },
    ],
  };
  assert.equal(isCanonicalUuid(historical.id), true);
  assert.equal(parseChefOrder(historical)?.id, historical.id);
});

test("accepts nullable legacy snapshot labels from the Order Service schema", () => {
  const historical = {
    ...order,
    kitchenName: null,
    items: [{ ...order.items[0], category: null, foodType: null }],
  };
  const parsed = parseChefOrder(historical);
  assert.equal(parsed?.kitchenName, null);
  assert.equal(parsed?.items[0]?.category, null);
  assert.equal(parsed?.items[0]?.foodType, null);
});

test("uses createdAt for legacy rows without updatedAt", () => {
  const historical = { ...order, updatedAt: undefined };
  const parsed = parseChefOrder(historical);
  assert.equal(parsed?.updatedAt, order.createdAt);
});

test("accepts direct, Spring Page and named deployed list envelopes", () => {
  assert.equal(parseChefOrdersResponse([order])?.length, 1);
  assert.equal(parseChefOrdersResponse({ content: [order] })?.length, 1);
  assert.equal(parseChefOrdersResponse({ orders: [order] })?.length, 1);
  assert.equal(parseChefOrdersResponse({ data: [order] })?.length, 1);
  assert.equal(parseChefOrdersResponse({ data: { orders: [order] } })?.length, 1);
});

test("accepts direct and named deployed detail envelopes", () => {
  assert.equal(parseChefOrderResponse(order)?.id, order.id);
  assert.equal(parseChefOrderResponse({ order })?.id, order.id);
  assert.equal(parseChefOrderResponse({ data: order })?.id, order.id);
  assert.equal(parseChefOrderResponse({ data: { order } })?.id, order.id);
});

test("rejects unknown order status and malformed ids", () => {
  assert.equal(parseChefOrder({ ...order, status: "PROVIDER_INTERNAL" }), null);
  assert.equal(parseChefOrder({ ...order, id: "bad" }), null);
  assert.equal(isCanonicalUuid("20000000-0000-0000-0000-00000000000z"), false);
});

test("validates complete chef order arrays", () => {
  assert.equal(parseChefOrders([order])?.length, 1);
  assert.equal(parseChefOrders([order, { ...order, id: "bad" }]), null);
  assert.equal(parseChefOrdersResponse({ unexpected: [order] }), null);
});

test("reads a chef order history page and rejects a broken one", () => {
  const second = { ...order, id: "11111111-2222-4333-8444-555555555556" };
  assert.deepEqual(parseChefOrderHistoryPage({ orders: [order, second], nextCursor: "c1", hasMore: true })?.orders.map((o) => o.id), [order.id, second.id]);
  assert.deepEqual(parseChefOrderHistoryPage({ orders: [], nextCursor: null, hasMore: false }), { orders: [], nextCursor: null, hasMore: false });
  assert.equal(parseChefOrderHistoryPage({ orders: [order], hasMore: false })?.nextCursor, null);
  for (const page of [
    { orders: [order], nextCursor: null, hasMore: true },
    { orders: [order], nextCursor: "", hasMore: false },
    { orders: [order], nextCursor: "c".repeat(513), hasMore: true },
    { orders: [order, order], nextCursor: null, hasMore: false },
    { orders: [{ ...order, status: "PROVIDER_INTERNAL" }], nextCursor: null, hasMore: false },
    { orders: [order], nextCursor: null, hasMore: "false" },
    { orders: [order], nextCursor: null, hasMore: false, total: 1 },
    { content: [order], nextCursor: null, hasMore: false },
    [order],
  ]) assert.equal(parseChefOrderHistoryPage(page), null);
  assert.equal(isChefOrderStatus("DELIVERED"), true);
  assert.equal(isChefOrderStatus("delivered"), false);
});
