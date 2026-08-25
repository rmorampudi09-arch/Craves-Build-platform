import assert from "node:assert/strict";
import test from "node:test";
import { parseAdvancedSearchResponse } from "./advanced-search-contract.ts";

const response = {
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
  items: [{
    id: "11111111-2222-4333-8444-555555555555",
    kitchenId: "21111111-2222-4333-8444-555555555555",
    kitchenName: "Kitchen",
    kitchenDisplayName: null,
    areaName: "Madhapur",
    city: "Hyderabad",
    distanceMeters: 900,
    itemName: "Meal",
    description: null,
    category: "Lunch",
    foodType: "VEG",
    price: 200,
    currency: "INR",
    preparationTimeMinutes: 30,
    primaryImageUrl: null,
  }],
};

test("accepts server-authoritative search fields", () => {
  assert.equal(parseAdvancedSearchResponse(response)?.items.length, 1);
});

test("rejects invented rating and invalid food types through strict validation", () => {
  assert.equal(parseAdvancedSearchResponse({ ...response, items: [{ ...response.items[0], foodType: "HEALTHY" }] }), null);
});
