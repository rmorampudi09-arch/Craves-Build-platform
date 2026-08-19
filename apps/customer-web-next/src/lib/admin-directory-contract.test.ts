import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminDirectorySearch, parseCustomerCase } from "./admin-directory-contract.ts";

const search = {
  correlationId: "4c2f061b-d094-42ab-8bea-1e8f5bb1fb87",
  queryType: "PHONE",
  hits: [{
    entityType: "CUSTOMER",
    identityId: "cc62bb4f-f06a-4a2c-9dc3-cdc518be8b02",
    recordId: "998ec1b8-1b7f-4e60-89e5-a5eb4ed6da1b",
    displayName: "Ravi Teja",
    secondaryLabel: "r•••@example.com",
    status: "ACTIVE_PROFILE",
    matchField: "PHONE",
    maskedMatchValue: "••••••4821",
    rawPhoneNumber: "+919999994821"
  }]
};

test("directory search accepts bounded masked hits and discards undeclared fields", () => {
  const parsed = parseAdminDirectorySearch(search);
  assert.equal(parsed?.hits[0]?.maskedMatchValue, "••••••4821");
  assert.equal("rawPhoneNumber" in (parsed?.hits[0] ?? {}), false);
});

test("directory search rejects unbounded or malformed results", () => {
  assert.equal(parseAdminDirectorySearch({ ...search, correlationId: "bad" }), null);
  assert.equal(parseAdminDirectorySearch({ ...search, hits: Array.from({ length: 21 }, () => search.hits[0]) }), null);
  assert.equal(parseAdminDirectorySearch({ ...search, hits: [{ ...search.hits[0], entityType: "ADMIN" }] }), null);
});

test("customer case preserves audited full contact and address fields", () => {
  const value = {
    correlationId: "4c2f061b-d094-42ab-8bea-1e8f5bb1fb87",
    profile: {
      profileId: "998ec1b8-1b7f-4e60-89e5-a5eb4ed6da1b",
      identityId: "cc62bb4f-f06a-4a2c-9dc3-cdc518be8b02",
      registeredPhoneNumber: "+919999994821",
      firstName: "Ravi",
      lastName: "Teja",
      email: "ravi@example.com",
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z"
    },
    addresses: [{
      addressId: "2d226d78-90e7-4bdf-abde-31a7f5a28651",
      addressLabel: "HOME",
      recipientName: "Ravi Teja",
      contactPhoneNumber: "+919999994821",
      addressLine1: "Road 1",
      addressLine2: null,
      landmark: null,
      areaName: "Madhapur",
      districtName: "Ranga Reddy",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500081",
      latitude: 17.45,
      longitude: 78.39,
      defaultAddress: true,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
      storagePath: "must-not-pass-through"
    }]
  };
  const parsed = parseCustomerCase(value);
  assert.equal(parsed?.profile.registeredPhoneNumber, "+919999994821");
  assert.equal(parsed?.addresses[0]?.districtName, "Ranga Reddy");
  assert.equal("storagePath" in (parsed?.addresses[0] ?? {}), false);
});
