import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateDiscoveryRadii,
  DEFAULT_DISCOVERY_RADIUS_METERS,
  formatDiscoveryRadius,
  MAX_DISCOVERY_RADIUS_METERS,
} from "./catalog-discovery-policy.ts";

test("customer discovery defaults to the 10 km browsing boundary", () => {
  assert.equal(DEFAULT_DISCOVERY_RADIUS_METERS, 10_000);
  assert.equal(MAX_DISCOVERY_RADIUS_METERS, 10_000);
  assert.deepEqual(candidateDiscoveryRadii(), [10_000]);
});

test("customer discovery never silently expands beyond the requested radius", () => {
  assert.deepEqual(candidateDiscoveryRadii(5_000), [5_000]);
  assert.deepEqual(candidateDiscoveryRadii(10_000), [10_000]);
});

test("rejects discovery radii outside the customer browsing boundary", () => {
  assert.throws(() => candidateDiscoveryRadii(0));
  assert.throws(() => candidateDiscoveryRadii(10_001));
  assert.equal(formatDiscoveryRadius(10_000), "10 km");
});
