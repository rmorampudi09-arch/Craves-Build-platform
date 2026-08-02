import assert from "node:assert/strict";
import test from "node:test";
import type { CustomerAddress } from "./address-contract.ts";
import { selectActiveDeliveryAddress } from "./address-selection.ts";

function address(id: string, active: boolean, isDefault: boolean): CustomerAddress {
  return {
    id,
    addressLabel: "HOME",
    recipientName: "Craves Customer",
    contactPhoneNumber: "+919876543210",
    addressLine1: "1-1",
    addressLine2: null,
    landmark: null,
    areaName: "Madhapur",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500081",
    latitude: 17.4483,
    longitude: 78.3915,
    isDefault,
    active,
    createdAt: "2026-08-02T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
  };
}

test("selects the active default delivery address", () => {
  const selected = selectActiveDeliveryAddress([
    address("inactive-default", false, true),
    address("active-other", true, false),
    address("active-default", true, true),
  ]);
  assert.equal(selected?.id, "active-default");
});

test("falls back to the first active address", () => {
  const selected = selectActiveDeliveryAddress([
    address("inactive", false, false),
    address("active", true, false),
  ]);
  assert.equal(selected?.id, "active");
});

test("returns null when no active delivery address exists", () => {
  assert.equal(selectActiveDeliveryAddress([address("inactive", false, true)]), null);
});
