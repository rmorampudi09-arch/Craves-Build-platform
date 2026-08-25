import assert from "node:assert/strict";
import test from "node:test";
import { parsePersonalisedRecommendations } from "./personalised-recommendations-contract.ts";

const item = {
  menuItemId: "11111111-2222-4333-8444-555555555555",
  kitchenId: "21111111-2222-4333-8444-555555555555",
  kitchenName: "Kitchen",
  kitchenDisplayName: null,
  areaName: null,
  city: "Hyderabad",
  itemName: "Meal",
  description: null,
  category: "Lunch",
  foodType: "VEG",
  price: 200,
  currency: "INR",
  preparationTimeMinutes: 30,
  primaryImageUrl: null,
  reasonCode: "SAVED_BY_YOU",
};

test("accepts explicit preference-backed recommendations", () => {
  assert.equal(parsePersonalisedRecommendations({ items: [item] })?.length, 1);
});

test("rejects invented recommendation reasons", () => {
  assert.equal(parsePersonalisedRecommendations({ items: [{ ...item, reasonCode: "AI_GUESSED" }] }), null);
});
