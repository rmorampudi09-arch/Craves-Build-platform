import assert from "node:assert/strict";
import test from "node:test";
import { homePin, orderJourney, tracksDelivery } from "./order-journey.ts";
import { parseCustomerOrder } from "./order-contract.ts";
import { parseDeliveryStatusResponse } from "./delivery-status.ts";

const ORDER_ID = "11111111-2222-4333-8444-555555555555";

const at = (status: string, prepTimeMinutes: number | null = null) => ({ status, prepTimeMinutes });
/** Where the order is, without its words. */
const shape = (journey: ReturnType<typeof orderJourney>) =>
  Object.fromEntries(Object.entries(journey).filter(([key]) => key !== "title" && key !== "detail"));

test("the kitchen steps follow the order until pickup", () => {
  assert.deepEqual(shape(orderJourney(at("PAYMENT_PENDING"), null)), { kind: "KITCHEN", step: -1 });
  assert.deepEqual(shape(orderJourney(at("PAID"), null)), { kind: "KITCHEN", step: 0 });
  assert.deepEqual(shape(orderJourney(at("CHEF_ACCEPTANCE_PENDING"), null)), { kind: "KITCHEN", step: 0 });
  assert.deepEqual(shape(orderJourney(at("CHEF_ACCEPTED"), null)), { kind: "KITCHEN", step: 1 });
  assert.deepEqual(shape(orderJourney(at("PREPARING"), null)), { kind: "KITCHEN", step: 1 });
  assert.deepEqual(shape(orderJourney(at("READY_FOR_PICKUP"), "COURIER_TO_PICKUP")), { kind: "KITCHEN", step: 2 });
});

test("the map goes live once the partner has the food, even before the order status moves", () => {
  for (const delivery of ["PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "DELIVERED"] as const) {
    assert.deepEqual(shape(orderJourney(at("READY_FOR_PICKUP"), delivery)), { kind: "DELIVERY", delivered: false });
  }
  assert.deepEqual(shape(orderJourney(at("OUT_FOR_DELIVERY"), null)), { kind: "DELIVERY", delivered: false });
  assert.deepEqual(shape(orderJourney(at("DELIVERED"), null)), { kind: "DELIVERY", delivered: true });
});

test("declined, cancelled and refunded orders have no map", () => {
  for (const status of ["CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"]) {
    assert.equal(orderJourney(at(status), "IN_TRANSIT").kind, "CLOSED");
  }
});

test("each step says what the app says", () => {
  const words = (status: string, delivery: Parameters<typeof orderJourney>[1] = null, prep: number | null = null) => {
    const { title, detail } = orderJourney(at(status, prep), delivery);
    return [title, detail];
  };
  assert.deepEqual(words("PAYMENT_PENDING"), ["Payment pending", "Finish the payment to send this order to the chef."]);
  assert.deepEqual(words("CHEF_ACCEPTANCE_PENDING"), ["Waiting for the chef", "The chef will confirm your order shortly."]);
  assert.deepEqual(words("CHEF_ACCEPTED", null, 20), ["Chef accepted", "Your order is confirmed and cooked fresh. Ready in about 20 min."]);
  assert.deepEqual(words("PREPARING", null, 15), ["Preparing your food", "The chef is cooking now. Ready in about 15 min."]);
  assert.deepEqual(words("PREPARING"), ["Preparing your food", "The chef is cooking now."]);
  assert.deepEqual(words("READY_FOR_PICKUP", "AT_PICKUP"), ["Ready for pickup", "Packed and waiting for the delivery partner."]);
  assert.deepEqual(words("READY_FOR_PICKUP", "PICKED_UP"), ["On the way", "Your order has been picked up and is coming to you."]);
  assert.deepEqual(words("OUT_FOR_DELIVERY", "IN_TRANSIT"), ["On the way", "Your order is in transit."]);
  assert.deepEqual(words("OUT_FOR_DELIVERY", "AT_DROPOFF"), ["Arriving at your location", "The delivery partner has reached the drop-off area."]);
  assert.deepEqual(words("DELIVERED"), ["Delivered", "Your order has been delivered. Enjoy your meal!"]);
  assert.deepEqual(words("CHEF_REJECTED"), ["Chef declined", "The chef could not take this order."]);
  assert.deepEqual(words("CANCELLED"), ["Order cancelled", "This order will not be delivered."]);
  assert.deepEqual(words("REFUND_PENDING"), ["Refund in progress", "Your refund is being processed."]);
  assert.deepEqual(words("REFUNDED"), ["Refunded", "Your payment has been refunded."]);
  assert.deepEqual(words("REFUND_FAILED"), ["Refund needs attention", "Get help below and we will sort it out."]);
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
