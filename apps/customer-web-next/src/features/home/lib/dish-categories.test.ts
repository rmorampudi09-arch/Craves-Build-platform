import assert from "node:assert/strict";
import test from "node:test";
import { inMenuCategory, menuCategoryLabel, toMenuCategory } from "./dishCategories.ts";

test("a category chip matches the chef's own category, not words in the dish name", () => {
  assert.equal(inMenuCategory({ category: "Biryani" }, "Biryani"), true);
  assert.equal(inMenuCategory({ category: " biryani " }, "Biryani"), true);
  assert.equal(inMenuCategory({ category: "Biriyani" }, "Biryani"), true);
  // "Chicken biryani curry" filed under Curry is a curry.
  assert.equal(inMenuCategory({ category: "Curry" }, "Biryani"), false);
  assert.equal(inMenuCategory({ category: "Biryani Specials" }, "Biryani"), false);
  // All (null) shows every dish, including categories without a chip.
  assert.equal(inMenuCategory({ category: "Pickles" }, null), true);
});

test("plural names from the web chef menu land on the app's chips", () => {
  assert.equal(toMenuCategory("Tiffins"), "Tiffin");
  assert.equal(toMenuCategory("Snacks"), "Snakes");
  assert.equal(toMenuCategory("snakes"), "Snakes");
  assert.equal(toMenuCategory("Sweets"), "Sweet Item");
  assert.equal(toMenuCategory("roti & chapati"), "Roti & Chapati");
  assert.equal(toMenuCategory("Pickles"), null);
  assert.equal(toMenuCategory(42), null);
  assert.equal(toMenuCategory(null), null);
});

test("people read Snacks where the server stores Snakes", () => {
  assert.equal(menuCategoryLabel("Snakes"), "Snacks");
  assert.equal(menuCategoryLabel("Snacks"), "Snacks");
  assert.equal(menuCategoryLabel("Sweet Item"), "Sweet Item");
  assert.equal(menuCategoryLabel("Pickles"), "Pickles");
});
