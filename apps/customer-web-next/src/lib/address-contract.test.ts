import assert from "node:assert/strict";
import test from "node:test";
import {
  addressLabelDraftError,
  addressLabelFromDraft,
  createAddressLabelDraft,
  displayAddressLabel,
  isDeliveryReadyAddress,
  parseAddressInput,
  parseCustomerAddress,
  parseCustomerAddresses,
  parseLocationRecommendation,
} from "./address-contract.ts";

const input = {
  addressLabel: "HOME",
  recipientName: "Ravi Teja",
  contactPhoneNumber: "+919876543210",
  addressLine1: "Plot 10",
  addressLine2: "Road 2",
  landmark: "Near Park",
  areaName: "Kukatpally",
  districtName: "Hyderabad",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500072",
  latitude: 17.493,
  longitude: 78.399,
  isDefault: true,
};

const metadata = {
  id: "11111111-1111-4111-8111-111111111111",
  active: true,
  createdAt: "2026-07-30T00:00:00Z",
  updatedAt: "2026-07-30T00:00:00Z",
};

test("custom labels survive save/read parsing, default updates and location recommendation", () => {
  for (const label of ["HOME", "WORK", "OTHER", "Mom's House", "అమ్మ ఇల్లు", "x".repeat(80)]) {
    const payload = parseAddressInput({ ...input, addressLabel: `  ${label}  ` });
    assert.ok(payload);
    assert.equal(payload.addressLabel, label);
    assert.equal("addressName" in payload, false);
    const saved = parseCustomerAddress({ ...metadata, ...payload });
    assert.ok(saved);
    assert.equal(saved.addressLabel, label);
    assert.equal(parseAddressInput({ ...saved, isDefault: false })?.addressLabel, label);
    assert.equal(parseLocationRecommendation({
      locationType: "SAVED_ADDRESS", latitude: input.latitude, longitude: input.longitude,
      selectedSavedAddress: saved, distanceMeters: 10, matchRadiusMeters: 100,
    })?.selectedSavedAddress?.addressLabel, label);
  }
});

test("rejects blank, missing, non-string and overlong address labels", () => {
  for (const addressLabel of [null, undefined, 123, "", " \t ", "x".repeat(81)]) {
    assert.equal(parseAddressInput({ ...input, addressLabel }), null);
    assert.equal(parseCustomerAddress({ ...metadata, ...input, addressLabel }), null);
  }
});

test("Other editing restores the custom label and keeps the category out of the API", () => {
  assert.deepEqual(createAddressLabelDraft("Mom's House"), { addressCategory: "OTHER", customLabel: "Mom's House" });
  assert.equal(addressLabelFromDraft({ addressCategory: "OTHER", customLabel: "  Mom's House  " }), "Mom's House");
  assert.equal(addressLabelFromDraft({ addressCategory: "WORK", customLabel: "Mom's House" }), "WORK");
  assert.equal(addressLabelFromDraft(createAddressLabelDraft("OTHER")), "Other");
  for (const customLabel of ["", "   ", "HOME", "WORK", "x".repeat(81)]) {
    const draft = { addressCategory: "OTHER" as const, customLabel };
    assert.ok(addressLabelDraftError(draft));
    assert.equal(addressLabelFromDraft(draft), null);
  }
  assert.equal(displayAddressLabel("HOME"), "Home");
  assert.equal(displayAddressLabel("WORK"), "Work");
  assert.equal(displayAddressLabel("OTHER"), "Other");
  assert.equal(displayAddressLabel("Mom's House"), "Mom's House");
});

test("validates customer-owned address input", () => {
  assert.deepEqual(parseAddressInput(input), input);
  assert.equal(parseAddressInput({ ...input, districtName: "" }), null);
  assert.equal(parseAddressInput({ ...input, latitude: 100 }), null);
  assert.equal(parseAddressInput({ ...input, contactPhoneNumber: "123" }), null);
  assert.equal(parseAddressInput({ ...input, latitude: "" }), null);
});

test("parses current address response without exposing identity id", () => {
  const parsed = parseCustomerAddress({
    ...metadata,
    identityId: "22222222-2222-4222-8222-222222222222",
    ...input,
  });
  assert.ok(parsed);
  assert.equal("identityId" in parsed, false);
  assert.equal(parsed.districtName, "Hyderabad");
  assert.equal(isDeliveryReadyAddress(parsed), true);
});

test("keeps pre-location-migration addresses visible but not checkout eligible", () => {
  const parsed = parseCustomerAddress({
    ...metadata,
    ...input,
    recipientName: null,
    areaName: null,
    districtName: null,
    postalCode: null,
    latitude: null,
    longitude: null,
  });

  assert.ok(parsed);
  assert.equal(parsed.recipientName, null);
  assert.equal(parsed.areaName, null);
  assert.equal(parsed.districtName, null);
  assert.equal(parsed.latitude, null);
  assert.equal(parsed.active, false);
  assert.equal(isDeliveryReadyAddress(parsed), false);
});

test("accepts legacy saved addresses without district until edited", () => {
  const parsed = parseCustomerAddress({
    ...metadata,
    ...input,
    districtName: null,
  });
  assert.ok(parsed);
  assert.equal(parsed.districtName, null);
  assert.equal(isDeliveryReadyAddress(parsed), true);
});

test("rejects a legacy address with only one coordinate", () => {
  assert.equal(parseCustomerAddress({
    ...metadata,
    ...input,
    latitude: 17.493,
    longitude: null,
  }), null);
});

test("accepts direct and common list envelopes", () => {
  const address = { ...metadata, ...input };
  assert.equal(parseCustomerAddresses([address])?.length, 1);
  assert.equal(parseCustomerAddresses({ addresses: [address] })?.length, 1);
  assert.equal(parseCustomerAddresses({ data: [address] })?.length, 1);
});

test("validates location recommendation", () => {
  const parsed = parseLocationRecommendation({
    locationType: "SAVED_ADDRESS",
    latitude: input.latitude,
    longitude: input.longitude,
    selectedSavedAddress: {
      ...metadata,
      ...input,
    },
    distanceMeters: 20,
    matchRadiusMeters: 100,
  });
  assert.ok(parsed);
  assert.equal(parsed.selectedSavedAddress?.id, metadata.id);
});
