import assert from "node:assert/strict";
import test from "node:test";
import type { FavoriteHomeCard, SavedMenuItem } from "./saved-resolve-contract.ts";
import {
  canAddSavedDish,
  canOpenSavedDish,
  chunk,
  favoriteHomeName,
  favoriteHomeState,
  isSavedDishCookingToday,
  isWatched,
  mergeSavedHomes,
  savedDishAvailability,
  savedDishKitchenName,
  savedDishName,
  watchChanges,
  type WatchKey,
} from "./saved-presentation.ts";

const KITCHEN = "6b000000-0000-4000-8000-000000000001";
const OTHER_KITCHEN = "6b000000-0000-4000-8000-000000000002";
const CHEF = "c4000000-0000-4000-8000-000000000001";
const OTHER_CHEF = "c4000000-0000-4000-8000-000000000002";

const dish: SavedMenuItem = {
  menuItemId: "11111111-1111-4111-8111-111111111111",
  found: true,
  availabilityState: "AVAILABLE_NOW",
  itemName: " Rajma chawal ",
  price: 180,
  currency: "INR",
  itemStatus: "ACTIVE",
  itemAvailable: true,
  kitchenId: KITCHEN,
  kitchenName: "Asha's kitchen",
  kitchenDisplayName: null,
  kitchenStatus: "ACTIVE",
  primaryImageUrl: null,
  timezoneId: "Asia/Kolkata",
  acceptingOrders: true,
  paused: false,
  availableNow: true,
  nextAvailabilityAt: null,
};

function home(
  requestedType: "CHEF" | "KITCHEN",
  requestedId: string,
  overrides: Partial<FavoriteHomeCard> = {},
): FavoriteHomeCard {
  return {
    requestedType,
    requestedId,
    exists: true,
    kitchenId: KITCHEN,
    chefIdentityId: CHEF,
    kitchenName: "Asha's kitchen",
    displayName: null,
    areaName: "Kondapur",
    city: "Hyderabad",
    cookingState: "NOT_TODAY",
    ...overrides,
  };
}

test("saved dish availability uses the app's copy and the kitchen's local time", () => {
  assert.deepEqual(savedDishAvailability(dish), {
    title: "Cooking now",
    detail: "This saved dish is currently available to order.",
    tone: "positive",
  });
  const later = savedDishAvailability({
    ...dish,
    availabilityState: "COOKING_LATER_TODAY",
    nextAvailabilityAt: "2026-10-15T13:30:00Z",
  });
  assert.equal(later.title, "Cooking later today");
  assert.match(later.detail ?? "", /^Next kitchen window starts around 7:00\s?pm\.$/i);
  assert.equal(savedDishAvailability({ ...dish, availabilityState: "NOT_TODAY" }).detail, null);
  assert.equal(
    savedDishAvailability({
      ...dish,
      availabilityState: "PAUSED",
      nextAvailabilityAt: "x",
      timezoneId: "Not/AZone",
    }).detail,
    null,
  );
  assert.equal(
    savedDishAvailability({ ...dish, availabilityState: "RETIRED" }).title,
    "No longer on the menu",
  );
  assert.equal(savedDishAvailability({ ...dish, availabilityState: "MISSING" }).tone, "muted");
});

test("cooking today means now or later today", () => {
  assert.equal(isSavedDishCookingToday(dish), true);
  assert.equal(
    isSavedDishCookingToday({ ...dish, availabilityState: "COOKING_LATER_TODAY" }),
    true,
  );
  assert.equal(isSavedDishCookingToday({ ...dish, availabilityState: "PAUSED" }), false);
});

test("a saved dish opens while it and its kitchen are live, and adds only when orderable now", () => {
  assert.equal(canOpenSavedDish(dish), true);
  assert.equal(canOpenSavedDish({ ...dish, kitchenStatus: "INACTIVE" }), false);
  assert.equal(canOpenSavedDish({ ...dish, found: false }), false);
  assert.equal(canAddSavedDish(dish), true);
  for (const change of [
    { paused: true },
    { acceptingOrders: false },
    { itemAvailable: false },
    { availableNow: false },
    { kitchenId: null },
    { availabilityState: "COOKING_LATER_TODAY" as const },
  ]) {
    assert.equal(canAddSavedDish({ ...dish, ...change }), false, JSON.stringify(change));
  }
});

test("names fall back like the app", () => {
  assert.equal(savedDishName(dish), "Rajma chawal");
  assert.equal(savedDishName({ ...dish, itemName: "  " }), "Saved dish");
  assert.equal(savedDishKitchenName({ ...dish, kitchenDisplayName: "Asha Rao" }), "Asha Rao");
  assert.equal(savedDishKitchenName({ ...dish, kitchenName: null }), "Home kitchen");
  assert.equal(favoriteHomeName(home("KITCHEN", KITCHEN, { displayName: "Asha Rao" })), "Asha Rao");
  assert.equal(
    favoriteHomeName(home("KITCHEN", KITCHEN, { kitchenName: null })),
    "Saved home kitchen",
  );
  assert.deepEqual(favoriteHomeState(home("CHEF", CHEF, { cookingState: "MISSING" })), {
    title: "Home kitchen no longer listed",
    tone: "muted",
  });
});

test("a chef whose kitchen is also saved shows once, and homes cooking today come first", () => {
  const kitchenCards = [
    home("KITCHEN", KITCHEN),
    home("KITCHEN", OTHER_KITCHEN, {
      kitchenId: OTHER_KITCHEN,
      chefIdentityId: null,
      cookingState: "COOKING_NOW",
    }),
  ];
  const chefCards = [
    home("CHEF", CHEF),
    home("CHEF", OTHER_CHEF, {
      kitchenId: null,
      chefIdentityId: null,
      exists: false,
      cookingState: "MISSING",
    }),
  ];
  const merged = mergeSavedHomes(kitchenCards, chefCards);
  assert.deepEqual(
    merged.map((entry) => [entry.card.requestedId, entry.kitchenId, entry.chefIdentityId]),
    [
      [OTHER_KITCHEN, OTHER_KITCHEN, null],
      [KITCHEN, KITCHEN, CHEF],
      [OTHER_CHEF, null, OTHER_CHEF],
    ],
  );
});

test("the bell turns the kitchen alert on, else the chef's, and turns every alert behind the row off", () => {
  const both = { card: home("KITCHEN", KITCHEN), kitchenId: KITCHEN, chefIdentityId: CHEF };
  const chefOnly = { card: home("CHEF", CHEF), kitchenId: null, chefIdentityId: CHEF };
  const none = new Set<WatchKey>();
  assert.deepEqual(watchChanges(both, none), [
    { entityType: "KITCHEN", entityId: KITCHEN, enabled: true },
  ]);
  assert.deepEqual(watchChanges(chefOnly, none), [
    { entityType: "CHEF", entityId: CHEF, enabled: true },
  ]);
  assert.equal(isWatched(both, none), false);
  const chefOn = new Set<WatchKey>([`CHEF:${CHEF}`]);
  assert.equal(isWatched(both, chefOn), true);
  assert.deepEqual(watchChanges(both, chefOn), [
    { entityType: "CHEF", entityId: CHEF, enabled: false },
  ]);
  assert.deepEqual(
    watchChanges(both, new Set<WatchKey>([`CHEF:${CHEF}`, `KITCHEN:${KITCHEN}`])).map(
      (change) => change.entityType,
    ),
    ["KITCHEN", "CHEF"],
  );
});

test("chunks ids into backend-sized batches", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
});
