import assert from "node:assert/strict";
import test from "node:test";
import { leafGeometry } from "./leaf-geometry.ts";
import { courseOf, fitOnLeaf, leafCaption, leafLayout, LEAF_MAX_DISHES, PLATE_SHAPE } from "./leaf-plate.ts";

const g = leafGeometry(300, 150, PLATE_SHAPE);

test("the app's categories read as courses, in serving order", () => {
  assert.equal(courseOf("Curry"), "Curries");
  assert.equal(courseOf("Biryani"), "Biryani");
  assert.equal(courseOf("Roti & Chapati"), "Roti");
  assert.equal(courseOf("Sweet Item"), "Sweets");
  assert.equal(courseOf("Snakes"), "Snacks");
  assert.equal(courseOf("Tiffin"), "Tiffin");
  assert.equal(courseOf("Meals"), "Meals");
  assert.equal(courseOf("Pickles"), "Pickles");
  assert.equal(courseOf(undefined), "Curries");
});

test("a curry sits along the midrib and meals by the margin, on the leaf and apart", () => {
  const layout = leafLayout([{ key: "meals", course: "Meals" }, { key: "curry", course: "Curries" }], g, { base: 44 });
  assert.equal(layout.fits, true);
  const curry = layout.dishes.find((dish) => dish.key === "curry");
  const meals = layout.dishes.find((dish) => dish.key === "meals");
  assert.ok(curry && meals);
  assert.equal(curry.row, 0);
  assert.equal(meals.row, 1);
  for (const dish of layout.dishes) {
    assert.ok(dish.y - dish.size / 2 > g.midY(dish.x), `${dish.key} sits below the midrib`);
    assert.ok(dish.y + dish.size / 2 < g.marginY(dish.x) + 1, `${dish.key} sits above the margin`);
    assert.ok(dish.size >= 44, "every photo stays a 44 px target");
  }
  assert.ok(Math.hypot(curry.x - meals.x, curry.y - meals.y) >= (curry.size + meals.size) / 2 + 8);
  assert.equal(leafCaption(layout.dishes.map((dish) => dish.course)), "Your leaf: a curry along the top, meals in the middle.");
});

test("a crowded cart keeps what fits on the leaf and names the rest", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ key: `d${i}`, course: courseOf(["Curry", "Rice", "Sweet Item"][i % 3]) }));
  const layout = fitOnLeaf(items, g, { base: 44 });
  assert.ok(layout.dishes.length <= LEAF_MAX_DISHES);
  assert.equal(layout.dishes.length + layout.hidden, items.length);
  assert.match(leafCaption(layout.dishes.map((dish) => dish.course), layout.hidden), /more in the list below\.$/);
});
