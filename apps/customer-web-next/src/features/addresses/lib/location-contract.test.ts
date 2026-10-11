import assert from "node:assert/strict";
import test from "node:test";
import { parseOlaReverseGeocode } from "./location-contract.ts";

const response = {
  status: "ok",
  results: [
    {
      formatted_address: "101, Test Road, Madhapur, Hyderabad, Telangana, 500081, India",
      types: ["street_address"],
      geometry: { location: { lat: 17.4483, lng: 78.3915 }, location_type: "rooftop" },
      address_components: [
        { types: ["street_number"], long_name: "101", short_name: "101" },
        { types: ["route"], long_name: "Test Road", short_name: "Test Road" },
        { types: ["sublocality_level_1", "sublocality"], long_name: "Madhapur", short_name: "Madhapur" },
        { types: ["locality"], long_name: "Hyderabad", short_name: "Hyderabad" },
        { types: ["administrative_area_level_2"], long_name: "Hyderabad", short_name: "Hyderabad" },
        { types: ["administrative_area_level_1"], long_name: "Telangana", short_name: "TG" },
        { types: ["postal_code"], long_name: "500081", short_name: "500081" },
        { types: ["country"], long_name: "India", short_name: "IN" },
      ],
    },
  ],
};

test("maps Ola Maps reverse geocoding into Craves address fields", () => {
  assert.deepEqual(parseOlaReverseGeocode(response), {
    formattedAddress: "101, Test Road, Madhapur, Hyderabad, Telangana, 500081, India",
    houseNumber: "101",
    street: "Test Road",
    area: "Madhapur",
    city: "Hyderabad",
    district: "Hyderabad",
    state: "Telangana",
    postalCode: "500081",
    country: "India",
    confidence: "High",
    preciseHouseNumber: true,
  });
});

test("keeps a useful address without inventing a house number", () => {
  const sparse = {
    status: "ok",
    results: [{
      formatted_address: "Kondapur, Serilingampalle, Rangareddy, Telangana, 500084, India",
      geometry: { location_type: "approximate" },
      address_components: [
        { types: ["locality"], long_name: "Kondapur", short_name: "Kondapur" },
        { types: ["administrative_area_level_2"], long_name: "Rangareddy", short_name: "Rangareddy" },
        { types: ["administrative_area_level_1"], long_name: "Telangana", short_name: "TG" },
      ],
    }],
  };
  const parsed = parseOlaReverseGeocode(sparse);
  assert.ok(parsed);
  assert.equal(parsed.houseNumber, null);
  assert.equal(parsed.preciseHouseNumber, false);
  assert.equal(parsed.area, "Kondapur");
  assert.equal(parsed.city, "Kondapur");
  assert.equal(parsed.district, "Rangareddy");
  assert.equal(parsed.postalCode, "500084");
  assert.equal(parsed.confidence, "Low");
  assert.equal(parsed.country, null);
});

test("skips results without a formatted address and rejects unusable bodies", () => {
  const parsed = parseOlaReverseGeocode({ results: [{ address_components: [] }, response.results[0]] });
  assert.equal(parsed?.houseNumber, "101");
  assert.equal(parseOlaReverseGeocode({ status: "zero_results", results: [] }), null);
  assert.equal(parseOlaReverseGeocode({ results: "invalid" }), null);
  assert.equal(parseOlaReverseGeocode(null), null);
});
