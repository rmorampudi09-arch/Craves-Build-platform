import assert from "node:assert/strict";
import test from "node:test";
import { activeMenuSectionIndex, groupKitchenMenu, kitchenFoodMixLabel, kitchenJoinedLabel, kitchenLocation } from "./kitchen-menu.ts";

test("groups the menu by category in the order the server sent, ignoring case", () => {
  const sections = groupKitchenMenu([
    { id: "1", category: "Biryani" }, { id: "2", category: "Snakes" }, { id: "3", category: "biryani " }, { id: "4", category: " " },
  ]);
  assert.deepEqual(sections.map(({ category, label, dishes }) => [category, label, dishes.map((dish) => dish.id)]), [
    ["Biryani", "Biryani", ["1", "3"]], ["Snakes", "Snacks", ["2"]], ["Other", "Other", ["4"]],
  ]);
});

test("names the kitchen's food mix", () => {
  assert.equal(kitchenFoodMixLabel([{ foodType: "VEG", veg: true }, { foodType: "EGG", veg: false }]), "Veg & non-veg");
  assert.equal(kitchenFoodMixLabel([{ foodType: "VEG", veg: true }]), "Pure veg");
  assert.equal(kitchenFoodMixLabel([{ veg: false }]), "Non-veg");
  assert.equal(kitchenFoodMixLabel([{ foodType: "EGG", veg: false }]), "Egg");
  assert.equal(kitchenFoodMixLabel([]), null);
});

test("location names each place once, and the joined year comes from a real date", () => {
  assert.equal(kitchenLocation(["Hyderabad", "hyderabad", null, " Telangana "]), "Hyderabad, Telangana");
  assert.equal(kitchenLocation([null, " "]), null);
  assert.equal(kitchenJoinedLabel("2025-03-01T10:00:00Z"), "On Craves since 2025");
  assert.equal(kitchenJoinedLabel("not a date"), null);
  assert.equal(kitchenJoinedLabel(null), null);
});

test("the active category is the last one whose top reached the line", () => {
  assert.equal(activeMenuSectionIndex([400, 900, 1400], 129), 0);
  assert.equal(activeMenuSectionIndex([-300, 129, 600], 129), 1);
  assert.equal(activeMenuSectionIndex([-900, -400, 100], 129), 2);
});
