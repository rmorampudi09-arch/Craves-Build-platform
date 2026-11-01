import assert from "node:assert/strict";
import test from "node:test";
import { parseFavoriteChef, parseFavoriteChefPage, parseFavoriteKitchen, parseFavoriteKitchenPage, parseFavoriteWatch, parseFavoriteWatches } from "./favorite-entities-contract.ts";

const KITCHEN = "6b000000-0000-4000-8000-000000000001";
const CHEF = "c4000000-0000-4000-8000-000000000001";
const watch = (overrides: Record<string, unknown> = {}) => ({ entityType: "KITCHEN", entityId: KITCHEN, channel: "IN_APP", enabled: true, lastNotifiedAt: null, lastNotificationWindowKey: null, createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z", ...overrides });

test("saved kitchens and chefs mirror the backend names and survive a second parse", () => {
  assert.deepEqual(parseFavoriteKitchen({ kitchenId: KITCHEN, createdAt: "2026-10-10T08:00:00Z" }), { kitchenId: KITCHEN, createdAt: "2026-10-10T08:00:00Z" });
  assert.deepEqual(parseFavoriteChef({ chefIdentityId: CHEF, createdAt: "2026-10-10T08:00:00Z", extra: true }), { chefIdentityId: CHEF, createdAt: "2026-10-10T08:00:00Z" });
  const page = parseFavoriteKitchenPage({ items: [{ kitchenId: KITCHEN, createdAt: "2026-10-10T08:00:00Z" }], nextCursor: "MTc2|abc" });
  assert.deepEqual(parseFavoriteKitchenPage(page), page);
  assert.deepEqual(parseFavoriteChefPage({ items: [], nextCursor: null }), { items: [], nextCursor: null });
});

test("broken saved lists are rejected", () => {
  assert.equal(parseFavoriteKitchen({ kitchenId: "nope", createdAt: "2026-10-10T08:00:00Z" }), null);
  assert.equal(parseFavoriteChef({ chefIdentityId: CHEF, createdAt: "later" }), null);
  assert.equal(parseFavoriteKitchenPage({ items: [{ kitchenId: CHEF }], nextCursor: null }), null);
  assert.equal(parseFavoriteKitchenPage({ items: Array(101).fill({ kitchenId: KITCHEN, createdAt: "2026-10-10T08:00:00Z" }), nextCursor: null }), null);
  assert.equal(parseFavoriteChefPage({ items: [], nextCursor: "" }), null);
  assert.equal(parseFavoriteChefPage([]), null);
});

test("watches keep the fields the web needs and reject unknown types and channels", () => {
  const parsed = parseFavoriteWatch(watch());
  assert.deepEqual(parsed, { entityType: "KITCHEN", entityId: KITCHEN, channel: "IN_APP", enabled: true, lastNotifiedAt: null, createdAt: "2026-10-10T08:00:00Z", updatedAt: "2026-10-10T08:00:00Z" });
  assert.deepEqual(parseFavoriteWatch(parsed), parsed);
  assert.equal(parseFavoriteWatches([watch(), watch({ entityType: "CHEF", entityId: CHEF, channel: "PUSH", enabled: false, lastNotifiedAt: "2026-10-11T08:00:00Z" })])?.length, 2);
  for (const bad of [watch({ entityType: "MENU_ITEM" }), watch({ channel: "SMS" }), watch({ enabled: "yes" }), watch({ lastNotifiedAt: "x" }), watch({ entityId: 1 })]) {
    assert.equal(parseFavoriteWatch(bad), null);
  }
  assert.equal(parseFavoriteWatches([watch(), null]), null);
  assert.equal(parseFavoriteWatches({}), null);
});
