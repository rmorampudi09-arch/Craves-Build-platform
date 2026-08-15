import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCheckout,
  parseCheckoutInput,
  parseCheckoutQuote,
  parseCheckoutQuoteInput,
} from "./checkout-contract.ts";

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  checkoutId: "22222222-2222-4222-8222-222222222222",
  customerIdentityId: "33333333-3333-4333-8333-333333333333",
  kitchenId: "44444444-4444-4444-8444-444444444444",
  kitchenName: "Annapurna",
  status: "PAYMENT_PENDING",
  currency: "INR",
  foodSubtotal: 180,
  platformFee: 5,
  taxAmount: 9,
  deliveryFee: 75,
  grandTotal: 269,
  chefResponseNote: null,
  prepTimeMinutes: null,
  deliveryAddress: null,
  pickupAddress: { private: true },
  items: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      menuItemId: "66666666-6666-4666-8666-666666666666",
      itemName: "Meals",
      category: "Lunch",
      foodType: "VEG",
      unitPrice: 180,
      quantity: 1,
      lineTotal: 180,
    },
  ],
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z",
};

const deliveryAddressId = "88888888-8888-4888-8888-888888888888";
const pricingQuoteId = "99999999-9999-4999-8999-999999999999";
const seededChargePolicyId = "20000000-0000-0000-0000-000000000001";

function backendCheckout() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    customerIdentityId: "33333333-3333-4333-8333-333333333333",
    status: "PAYMENT_PENDING",
    currency: "INR",
    foodSubtotal: 180,
    platformFee: 5,
    taxAmount: 9,
    deliveryFee: 75,
    grandTotal: 269,
    chargePolicyId: seededChargePolicyId,
    deliveryAddressId,
    deliveryAddress: {
      sourceAddressId: deliveryAddressId,
      recipientName: "Ravi",
      contactPhoneNumber: "+919876543210",
      addressLine1: "Plot 1",
      areaName: "Kukatpally",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500072",
    },
    orders: [order],
    createdAt: "2026-07-30T00:00:00Z",
  };
}

function backendQuote() {
  return {
    quoteId: pricingQuoteId,
    deliveryAddressId,
    currency: "INR",
    foodSubtotal: 180,
    platformFee: 5,
    taxAmount: 9,
    deliveryFee: 75,
    grandTotal: 269,
    chargePolicyId: seededChargePolicyId,
    taxes: {
      profileVersion: "IN_MARKETPLACE_GST_2026_08_V1",
      restaurantGstPercent: 5,
      feeInclusiveGstPercent: 18,
      foodTaxAdded: 9,
      platformTaxIncluded: 0.76,
      deliveryTaxIncluded: 11.44,
      taxAmountAddedToCheckout: 9,
      totalTaxAmount: 21.2,
    },
    deliveries: [
      {
        kitchenId: "44444444-4444-4444-8444-444444444444",
        kitchenName: "Annapurna",
        roadDistanceKm: 4.2,
        roadDistanceMeters: 4200,
        estimatedTravelMinutes: 16,
        baseDistanceKm: 5,
        baseDeliveryFee: 75,
        extraDistanceKm: 0,
        extraPerKm: 8,
        extraDistanceFee: 0,
        deliveryFee: 75,
        pricingVersion: "HYDERABAD_MARKET_2026_08_V1",
      },
    ],
    expiresAt: "2026-08-15T03:30:00Z",
    createdAt: "2026-08-15T03:20:00Z",
  };
}

test("parses the seeded backend charge-policy UUID and checkout totals", () => {
  const parsed = parseCheckout(backendCheckout());
  assert.ok(parsed);
  assert.equal(parsed.chargePolicyId, seededChargePolicyId);
  assert.equal(parsed.deliveryFee, 75);
  assert.equal(parsed.grandTotal, 269);
  assert.equal("customerIdentityId" in parsed, false);
  assert.equal("pickupAddress" in parsed.orders[0]!, false);
});

test("still rejects malformed charge-policy identifiers", () => {
  assert.equal(
    parseCheckout({ ...backendCheckout(), chargePolicyId: "not-a-uuid" }),
    null,
  );
});

test("parses backend delivery quote and route breakdown", () => {
  const parsed = parseCheckoutQuote(backendQuote());
  assert.ok(parsed);
  assert.equal(parsed.quoteId, pricingQuoteId);
  assert.equal(parsed.deliveryFee, 75);
  assert.equal(parsed.deliveries[0]!.roadDistanceMeters, 4200);
  assert.equal(parsed.deliveries[0]!.baseDistanceKm, 5);
  assert.equal(parsed.taxes.foodTaxAdded, 9);
  assert.equal(parsed.taxes.deliveryTaxIncluded, 11.44);
});

test("rejects malformed delivery quote", () => {
  assert.equal(parseCheckoutQuote({ ...backendQuote(), quoteId: "bad" }), null);
  assert.equal(
    parseCheckoutQuote({
      ...backendQuote(),
      deliveries: [{ ...backendQuote().deliveries[0], roadDistanceMeters: -1 }],
    }),
    null,
  );
});

test("validates checkout quote input", () => {
  assert.deepEqual(parseCheckoutQuoteInput({ deliveryAddressId }), { deliveryAddressId });
  assert.equal(parseCheckoutQuoteInput({ deliveryAddressId: "bad" }), null);
});

test("validates checkout input with pricing quote", () => {
  assert.deepEqual(
    parseCheckoutInput({ deliveryAddressId, pricingQuoteId, note: "Ring bell" }),
    { deliveryAddressId, pricingQuoteId, note: "Ring bell" },
  );
  assert.deepEqual(parseCheckoutInput({ deliveryAddressId, note: "   " }), {
    deliveryAddressId,
    pricingQuoteId: null,
    note: null,
  });
  assert.deepEqual(parseCheckoutInput({ deliveryAddressId }), {
    deliveryAddressId,
    pricingQuoteId: null,
    note: null,
  });
  assert.equal(
    parseCheckoutInput({ deliveryAddressId, pricingQuoteId: "bad", note: "Ring bell" }),
    null,
  );
  assert.equal(
    parseCheckoutInput({ deliveryAddressId: "bad", note: "Ring bell" }),
    null,
  );
  assert.equal(
    parseCheckoutInput({ deliveryAddressId, note: "x".repeat(501) }),
    null,
  );
  assert.equal(parseCheckoutInput({ deliveryAddressId, note: 123 }), null);
});
