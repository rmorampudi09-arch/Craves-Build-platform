import assert from "node:assert/strict";
import test from "node:test";
import { homePin, orderJourney, tracksDelivery } from "./order-journey.ts";
import { parseCustomerOrder } from "./order-contract.ts";
import { parseDeliveryStatusResponse } from "./delivery-status.ts";

const ORDER_ID = "11111111-2222-4333-8444-555555555555";

test("the kitchen steps follow the order until pickup", () => {
  assert.deepEqual(orderJourney("PAYMENT_PENDING", null), { kind: "KITCHEN", step: -1 });
  assert.deepEqual(orderJourney("PAID", null), { kind: "KITCHEN", step: 0 });
  assert.deepEqual(orderJourney("CHEF_ACCEPTANCE_PENDING", null), { kind: "KITCHEN", step: 0 });
  assert.deepEqual(orderJourney("CHEF_ACCEPTED", null), { kind: "KITCHEN", step: 1 });
  assert.deepEqual(orderJourney("PREPARING", null), { kind: "KITCHEN", step: 1 });
  assert.deepEqual(orderJourney("READY_FOR_PICKUP", "COURIER_TO_PICKUP"), {
    kind: "KITCHEN",
    step: 2,
  });
});

test("the map goes live once the partner has the food, even before the order status moves", () => {
  for (const delivery of ["PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "DELIVERED"] as const) {
    assert.deepEqual(orderJourney("READY_FOR_PICKUP", delivery), {
      kind: "DELIVERY",
      delivered: false,
    });
  }
  assert.deepEqual(orderJourney("OUT_FOR_DELIVERY", null), { kind: "DELIVERY", delivered: false });
  assert.deepEqual(orderJourney("DELIVERED", null), { kind: "DELIVERY", delivered: true });
});

test("declined, cancelled and refunded orders have no map", () => {
  for (const status of [
    "CHEF_REJECTED",
    "CANCELLED",
    "REFUND_PENDING",
    "REFUNDED",
    "REFUND_FAILED",
  ]) {
    assert.deepEqual(orderJourney(status, "IN_TRANSIT"), { kind: "CLOSED" });
  }
});

test("delivery is asked about from ready for pickup until delivered", () => {
  assert.equal(tracksDelivery("READY_FOR_PICKUP"), true);
  assert.equal(tracksDelivery("OUT_FOR_DELIVERY"), true);
  assert.equal(tracksDelivery("PREPARING"), false);
  assert.equal(tracksDelivery("DELIVERED"), false);
});

const order = {
  id: ORDER_ID,
  checkoutId: ORDER_ID,
  kitchenId: ORDER_ID,
  kitchenName: "Home Kitchen",
  status: "OUT_FOR_DELIVERY",
  currency: "INR",
  foodSubtotal: 250,
  platformFee: 0,
  taxAmount: 0,
  deliveryFee: 0,
  grandTotal: 250,
  items: [],
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:10:00Z",
  deliveryAddress: {
    recipientName: "Customer",
    addressLine1: "1 Test Road",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500001",
  },
};

test("the home pin comes from the address snapshot's coordinates, as numbers or decimal strings", () => {
  assert.deepEqual(
    homePin(
      parseCustomerOrder({
        ...order,
        deliveryAddress: { ...order.deliveryAddress, latitude: 17.41, longitude: "78.44" },
      }),
    ),
    { latitude: 17.41, longitude: 78.44 },
  );
  assert.equal(homePin(parseCustomerOrder(order)), null);
  for (const [latitude, longitude] of [
    [91, 78],
    [17, -181],
    [17, null],
    ["", 78],
    ["north", 78],
  ]) {
    assert.equal(
      homePin(
        parseCustomerOrder({
          ...order,
          deliveryAddress: { ...order.deliveryAddress, latitude, longitude },
        }),
      ),
      null,
    );
  }
  assert.equal(homePin(null), null);
});

test("the rider position is read when the server sends one and a bad one is dropped", () => {
  const base = {
    orderId: ORDER_ID,
    deliveryJobId: null,
    providerId: null,
    status: "IN_TRANSIT",
    trackingUrl: null,
    observedAt: "2026-07-30T00:20:00Z",
    history: [],
  };
  assert.equal("courierLocation" in parseDeliveryStatusResponse(base), false);
  assert.deepEqual(
    parseDeliveryStatusResponse({
      ...base,
      courierLocation: {
        latitude: 17.4,
        longitude: 78.4,
        observedAt: "2026-07-30T00:20:00Z",
        speed: 9,
      },
    }).courierLocation,
    { latitude: 17.4, longitude: 78.4, observedAt: "2026-07-30T00:20:00.000Z" },
  );
  for (const courierLocation of [
    { latitude: 95, longitude: 78, observedAt: base.observedAt },
    { latitude: 17, longitude: "78", observedAt: base.observedAt },
    { latitude: 17, longitude: 78 },
    "17,78",
    null,
  ]) {
    assert.equal(
      parseDeliveryStatusResponse({ ...base, courierLocation }).courierLocation,
      undefined,
    );
  }
});
