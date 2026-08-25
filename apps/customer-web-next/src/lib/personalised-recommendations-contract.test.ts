import assert from "node:assert/strict";
import test from "node:test";
import { mapSavedResolverToPersonalisedRecommendations } from "./personalised-recommendations-contract.ts";

const item = {
  menuItemId: "11111111-2222-4333-8444-555555555555",
  found: true,
  availabilityState: "AVAILABLE_NOW",
  evaluatedAt: "2026-08-25T10:00:00Z",
  itemName: "Meal",
  description: null,
  category: "Lunch",
  foodType: "VEG",
  price: 200,
  currency: "INR",
  itemStatus: "ACTIVE",
  itemAvailable: true,
  kitchenId: "21111111-2222-4333-8444-555555555555",
  kitchenName: "Kitchen",
  kitchenDisplayName: null,
  kitchenStatus: "ACTIVE",
  areaName: "Madhapur",
  city: "Hyderabad",
  state: "Telangana",
  primaryImageUrl: null,
  timezoneId: "Asia/Kolkata",
  scheduleConfigured: true,
  acceptingOrders: true,
  paused: false,
  availableNow: true,
  nextAvailabilityAt: null,
};

test("maps explicit saved-item catalog state without inventing ranking", () => {
  const result = mapSavedResolverToPersonalisedRecommendations({
    evaluatedAt: "2026-08-25T10:00:00Z",
    items: [item],
  });
  assert.equal(result?.[0]?.reasonCode, "SAVED_BY_YOU");
  assert.equal(result?.[0]?.availableNow, true);
});

test("drops a missing saved item instead of fabricating a recommendation", () => {
  const missing = {
    ...item,
    found: false,
    availabilityState: "MISSING",
    itemName: null,
    kitchenId: null,
  };
  assert.deepEqual(
    mapSavedResolverToPersonalisedRecommendations({ evaluatedAt: "2026-08-25T10:00:00Z", items: [missing] }),
    [],
  );
});

test("rejects unknown catalog availability states", () => {
  assert.equal(
    mapSavedResolverToPersonalisedRecommendations({ items: [{ ...item, availabilityState: "AI_GUESSED" }] }),
    null,
  );
});
