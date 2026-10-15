import assert from "node:assert/strict";
import test from "node:test";
import type { NearbyKitchen } from "../../home/lib/discovery-contract.ts";
import { sortKitchens } from "./kitchen-filters.ts";

const kitchen = (id: string, kitchenName: string, displayName: string | null = null) =>
  ({ id, kitchenName, displayName }) as NearbyKitchen;

test("Name A–Z sorts by the name on the card and keeps the nearest first among equal names", () => {
  const nearestFirst = [kitchen("1", "Zaika", "anna's kitchen"), kitchen("2", "Biryani House"), kitchen("3", "Anna's Kitchen"), kitchen("4", "anna's kitchen")];
  assert.deepEqual(sortKitchens(nearestFirst, "name-a-z").map((item) => item.id), ["1", "4", "3", "2"]);
  assert.equal(sortKitchens(nearestFirst, "recommended"), nearestFirst);
});
