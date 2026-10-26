import assert from "node:assert/strict";
import test from "node:test";
import { ALL_DISHES, filterDishes, menuCounts, sortCategories } from "./chef-menu-filters.ts";

const dish = (itemName: string, category: string, status: "DRAFT" | "ACTIVE" | "INACTIVE", available = true, description: string | null = null) => ({ itemName, category, status, available, description });
const menu = [
  dish("Chicken dum biryani", "biryani", "ACTIVE"),
  dish("Veg biryani", "Biryani", "ACTIVE", false),
  dish("Idli", "Tiffins", "ACTIVE", true, "Soft, with coconut chutney"),
  dish("Rasmalai", "Sweets", "DRAFT", false),
  dish("Mango pickle", "Amma's specials", "INACTIVE"),
];
const names = (items: { itemName: string }[]) => items.map((item) => item.itemName);

test("the pills count on, off (switched off or taken off the menu) and drafts", () => {
  assert.deepEqual(menuCounts(menu), { ALL: 5, ON: 2, OFF: 2, DRAFT: 1 });
  assert.deepEqual(sortCategories(["Amma's specials", "Tiffins", "Biryani", "Sweets", "Biryani"]), ["Biryani", "Tiffins", "Sweets", "Amma's specials"]);
});

test("a filter and the search words narrow the list together", () => {
  assert.deepEqual(names(filterDishes(menu, "", { kind: "status", status: "OFF" })), ["Veg biryani", "Mango pickle"]);
  assert.deepEqual(names(filterDishes(menu, "", { kind: "category", category: "Biryani" })), ["Chicken dum biryani", "Veg biryani"]);
  assert.deepEqual(names(filterDishes(menu, " COCONUT ", ALL_DISHES)), ["Idli"]);
  assert.deepEqual(names(filterDishes(menu, "బిర్యానీ", { kind: "status", status: "ON" }, "te")), ["Chicken dum biryani"]);
  assert.deepEqual(filterDishes(menu, "paneer", ALL_DISHES), []);
});
