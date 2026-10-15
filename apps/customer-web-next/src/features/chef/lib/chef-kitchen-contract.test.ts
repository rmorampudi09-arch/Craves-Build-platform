import assert from "node:assert/strict";
import test from "node:test";
import { CHEF_AVATAR_IDS, chefAvatarGateStep, chefAvatarIdFromUrl, chefAvatarUrl, kitchenPhotoSlots, parseChefKitchen, parseChefKitchenInput } from "./chef-kitchen-contract.ts";

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

test("lists the 18 drawn faces and finds the face a picture link points to", () => {
  assert.equal(CHEF_AVATAR_IDS.length, 18);
  assert.equal(CHEF_AVATAR_IDS[0], "chef-avatar-01");
  assert.equal(CHEF_AVATAR_IDS[17], "chef-avatar-18");
  assert.equal(chefAvatarUrl("chef-avatar-07"), "https://craves.in/media/public/chef-avatars/chef-avatar-07.jpg");
  assert.equal(chefAvatarIdFromUrl(chefAvatarUrl("chef-avatar-07")), "chef-avatar-07");
  assert.equal(chefAvatarIdFromUrl("https://cdn.example/x/chef-avatar-18.jpg?v=2"), "chef-avatar-18");
  for (const other of [null, undefined, "", "https://craves.in/media/chef-avatar-19.jpg", "https://craves.in/media/kitchen.jpg", "https://craves.in/chef-avatar-01.png"]) {
    assert.equal(chefAvatarIdFromUrl(other), null);
  }
});

test("asks for a picture only for a loaded, unsuspended kitchen whose server says it has none", () => {
  const loaded = parseChefKitchen({ ...kitchen, chefPhotoUrl: null })!;
  assert.equal(chefAvatarGateStep(loaded), "ask");
  assert.equal(chefAvatarGateStep({ ...loaded, status: "DRAFT" }), "ask");
  assert.equal(chefAvatarGateStep({ ...loaded, status: "SUSPENDED" }), "open");
  assert.equal(chefAvatarGateStep({ ...loaded, chefPhotoUrl: chefAvatarUrl("chef-avatar-02") }), "open");
  assert.equal(chefAvatarGateStep(parseChefKitchen(kitchen)), "open"); // an older server leaves the field out
  assert.equal(chefAvatarGateStep(null), "open"); // no kitchen yet
  assert.equal(chefAvatarGateStep("failed"), "open");
});

test("keeps the chef picture only when the server sent it, and only as an https link", () => {
  assert.equal("chefPhotoUrl" in parseChefKitchen(kitchen)!, false);
  assert.equal(parseChefKitchen({ ...kitchen, chefPhotoUrl: null })?.chefPhotoUrl, null);
  assert.equal(parseChefKitchen({ ...kitchen, chefPhotoUrl: chefAvatarUrl("chef-avatar-03") })?.chefPhotoUrl, chefAvatarUrl("chef-avatar-03"));
  assert.equal(parseChefKitchen({ ...kitchen, chefPhotoUrl: "http://craves.in/a.jpg" })?.chefPhotoUrl, null);
  assert.equal(parseChefKitchen({ ...kitchen, chefPhotoUrl: 42 })?.chefPhotoUrl, null);
});

test("keeps https kitchen photos only, and tells the overall photo from the cooking setup", () => {
  const k1 = "https://craves.in/media/k1.jpg", k2 = "https://craves.in/media/k2.jpg";
  const parsed = parseChefKitchen({ ...kitchen, kitchenPhotoUrl: k1, kitchenPhotoUrls: [k1, "http://craves.in/x.jpg", 7, k2, "https://craves.in/media/k3.jpg"] })!;
  assert.deepEqual(parsed.kitchenPhotoUrls, [k1, k2]);
  assert.deepEqual(kitchenPhotoSlots(parsed), [k1, k2]);
  assert.deepEqual(kitchenPhotoSlots({ ...parsed, kitchenPhotoUrls: [k1] }), [k1, null]);
  assert.deepEqual(kitchenPhotoSlots({ ...parsed, kitchenPhotoUrl: null, kitchenPhotoUrls: [] }), [null, null]);
  // Support emptied slot 1: the overall photo is the one to add next.
  assert.deepEqual(kitchenPhotoSlots({ ...parsed, kitchenPhotoUrl: null, kitchenPhotoUrls: [k2] }), [null, k2]);
  assert.equal(kitchenPhotoSlots(parseChefKitchen(kitchen)!), undefined);
  assert.equal("kitchenPhotoUrl" in parseChefKitchen(kitchen)!, false);
});
