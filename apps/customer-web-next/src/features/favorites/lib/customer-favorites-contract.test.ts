import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCustomerFavorite,
  parseCustomerFavorites,
} from "./customer-favorites-contract.ts";

const favorite = {
  menuItemId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-08-22T00:00:00Z",
};

test("parses a valid customer favorite", () => {
  assert.deepEqual(parseCustomerFavorite(favorite), favorite);
});

test("rejects malformed customer favorites", () => {
  assert.equal(parseCustomerFavorite({ ...favorite, menuItemId: "not-a-uuid" }), null);
  assert.equal(parseCustomerFavorite({ ...favorite, createdAt: "not-a-date" }), null);
  assert.equal(parseCustomerFavorite(null), null);
});

test("parses a bounded favorite list", () => {
  const parsed = parseCustomerFavorites([favorite]);
  assert.ok(parsed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.menuItemId, favorite.menuItemId);
});

test("rejects invalid or oversized favorite lists", () => {
  assert.equal(parseCustomerFavorites({ favorites: [favorite] }), null);
  assert.equal(parseCustomerFavorites(Array.from({ length: 201 }, () => favorite)), null);
  assert.equal(parseCustomerFavorites([{ ...favorite, menuItemId: "bad" }]), null);
});
