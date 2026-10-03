import assert from "node:assert/strict";
import test from "node:test";
import { parseChefKitchen, parseChefKitchenInput } from "./chef-kitchen-contract.ts";

const kitchen = {
  id: "11111111-2222-4333-8444-555555555555",
  identityId: "21111111-2222-4333-8444-555555555555",
  kitchenName: "Home Kitchen",
  displayName: "Home Kitchen",
  addressLine1: "1 Test Road",
  city: "Hyderabad",
  state: "Telangana",
  status: "ACTIVE",
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z"
};

test("removes backend identity ownership field", () => {
  const parsed = parseChefKitchen(kitchen);
  assert.equal(parsed?.kitchenName, "Home Kitchen");
  assert.equal("identityId" in (parsed ?? {}), false);
});

test("accepts suspended read state but blocks suspended writes", () => {
  assert.equal(parseChefKitchen({ ...kitchen, status: "SUSPENDED" })?.status, "SUSPENDED");
  assert.equal(parseChefKitchenInput({ ...kitchen, status: "SUSPENDED" }), null);
  assert.ok(parseChefKitchenInput({ ...kitchen, status: "INACTIVE" }));
});

test("requires paired coordinates", () => {
  assert.equal(parseChefKitchenInput({ ...kitchen, status: "DRAFT", latitude: 17.4, longitude: null }), null);
});

const pickupReadyKitchen = { ...kitchen, phoneNumber: "+919999999999", areaName: "Madhapur", postalCode: "500081", latitude: 17.4483, longitude: 78.3915 };

test("accepts a complete active pickup profile without changing existing fields", () => {
  const parsed = parseChefKitchenInput(pickupReadyKitchen);
  assert.ok(parsed);
  for (const field of ["phoneNumber", "areaName", "postalCode", "latitude", "longitude"] as const) {
    assert.equal(parsed[field], pickupReadyKitchen[field]);
  }
});

for (const field of ["phoneNumber", "areaName", "postalCode"] as const) {
  for (const missing of [null, undefined, "", "   "]) {
    test(`blocks opening a kitchen with missing ${field}: ${String(missing)}`, () => {
      assert.equal(parseChefKitchenInput({ ...pickupReadyKitchen, [field]: missing }), null);
      assert.ok(parseChefKitchenInput({ ...pickupReadyKitchen, [field]: missing, status: "DRAFT" }));
      assert.ok(parseChefKitchenInput({ ...pickupReadyKitchen, [field]: missing, status: "INACTIVE" }));
    });
  }
}

test("keeps a legacy incomplete kitchen readable so its chef can repair it", () => {
  assert.ok(parseChefKitchen({ ...pickupReadyKitchen, phoneNumber: null, areaName: null, postalCode: null }));
});

for (const [field, limit] of [["kitchenName", 160], ["displayName", 160], ["city", 80], ["state", 80], ["postalCode", 16]] as const) {
  test(`accepts ${field} at its database limit and rejects a longer write`, () => {
    const input = { ...kitchen, status: "DRAFT", [field]: "x".repeat(limit) };
    assert.equal(parseChefKitchenInput(input)?.[field], "x".repeat(limit));
    assert.equal(parseChefKitchenInput({ ...input, [field]: "x".repeat(limit + 1) }), null);
    assert.equal(parseChefKitchenInput({ ...input, [field]: 123 }), null);
  });
}
