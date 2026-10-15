import assert from "node:assert/strict";
import test from "node:test";
import { parseKitchenProfile } from "./kitchen-profile-contract.ts";

// Shape of the privacy-sanitised public catalog read: address, phone, identity and createdAt are null.
const kitchen = {
  id: "4a000000-0000-4000-8000-000000000001", identityId: null, kitchenName: "Asha's Kitchen", displayName: " Asha ", description: null,
  phoneNumber: null, email: null, addressLine1: null, areaName: "Kondapur", city: "Hyderabad", state: "Telangana", postalCode: null,
  status: "ACTIVE", createdAt: null, updatedAt: null, chefPhotoUrl: "https://craves.in/media/chef.jpg", kitchenPhotoUrl: "https://craves.in/media/k1.jpg",
  kitchenPhotoUrls: ["https://craves.in/media/k1.jpg", "http://craves.in/media/k2.jpg", "https://craves.in/media/k1.jpg", 42, "https://craves.in/media/k3.jpg"],
  cuisines: [], serviceAreas: [], socialLinks: null,
};

test("keeps the public fields, https-only unique kitchen photos and a safe chef photo", () => {
  assert.deepEqual(parseKitchenProfile(kitchen), {
    id: kitchen.id, kitchenName: "Asha's Kitchen", displayName: "Asha", description: null, areaName: "Kondapur", city: "Hyderabad", state: "Telangana",
    status: "ACTIVE", createdAt: null, chefPhotoUrl: "https://craves.in/media/chef.jpg", kitchenPhotoUrls: ["https://craves.in/media/k1.jpg", "https://craves.in/media/k3.jpg"],
  });
  const many = Array.from({ length: 20 }, (_, i) => `https://craves.in/media/k${i}.jpg`);
  assert.equal(parseKitchenProfile({ ...kitchen, kitchenPhotoUrls: many })?.kitchenPhotoUrls.length, 12);
  const bare = parseKitchenProfile({ id: kitchen.id, kitchenName: "K", status: "DRAFT", createdAt: "2026-10-01T00:00:00Z", chefPhotoUrl: "javascript:alert(1)" });
  assert.deepEqual([bare?.chefPhotoUrl, bare?.kitchenPhotoUrls, bare?.city, bare?.createdAt], [null, [], null, "2026-10-01T00:00:00Z"]);
});

test("rejects a broken contract", () => {
  for (const value of [
    null, [], { ...kitchen, id: "nope" }, { ...kitchen, status: "LIVE" }, { ...kitchen, kitchenName: " " }, { ...kitchen, kitchenName: null },
    { ...kitchen, city: 7 }, { ...kitchen, createdAt: "yesterday" }, { ...kitchen, kitchenPhotoUrls: "https://craves.in/a.jpg" }, { ...kitchen, displayName: "d".repeat(181) },
  ]) assert.equal(parseKitchenProfile(value), null);
});
