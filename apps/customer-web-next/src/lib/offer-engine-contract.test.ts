import assert from "node:assert/strict";
import test from "node:test";
import { parseOfferList, parseOfferResponse } from "./offer-engine-contract.ts";

const offer = {
  id: "11111111-2222-4333-8444-555555555555",
  code: "APPROVED",
  title: "Configured offer",
  description: null,
  discountType: "FLAT",
  discountValue: 10,
  maxDiscountAmount: null,
  minimumFoodSubtotal: null,
  currency: "INR",
  discountAmount: 10,
  foodSubtotal: 100,
  foodSubtotalAfterDiscount: 90,
  startsAt: null,
  endsAt: null,
};

test("accepts server-calculated offer data", () => {
  assert.equal(parseOfferResponse(offer)?.discountAmount, 10);
  assert.equal(parseOfferList([offer])?.length, 1);
});

test("rejects invalid discount types", () => {
  assert.equal(parseOfferResponse({ ...offer, discountType: "CLIENT_DEFINED" }), null);
});
