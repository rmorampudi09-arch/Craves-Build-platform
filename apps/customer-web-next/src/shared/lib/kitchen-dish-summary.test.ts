import assert from "node:assert/strict";
import test from "node:test";
import { formatDishPrice, formatPreparationTime, summarizeKitchenDishes } from "./kitchen-dish-summary.ts";

const A = "4b1c0000-0000-4000-8000-00000000000a";
const B = "4b1c0000-0000-4000-8000-00000000000b";

test("formats prices with the rupee sign, paise only when there are any", () => {
  assert.equal(formatDishPrice(180), "₹180");
  assert.equal(formatDishPrice(180.5, "inr"), "₹180.50");
  assert.equal(formatDishPrice(12, "USD"), "USD 12.00");
});

test("prep time is one value or the range, ignoring dishes without one", () => {
  assert.equal(formatPreparationTime([{ prepMinutes: 25 }, {}, { prepMinutes: 25 }]), "25 min");
  assert.equal(formatPreparationTime([{ prepMinutes: 45 }, { prepMinutes: 20 }]), "20–45 min");
  assert.equal(formatPreparationTime([{}, { prepMinutes: 0 }]), null);
});

test("summarises each kitchen's photos, prep time and cheapest dish", () => {
  const summaries = summarizeKitchenDishes([
    { kitchenId: A, img: "https://img.craves.test/biryani.webp", price: 240, prepMinutes: 40 },
    { kitchenId: A, img: "/brand/craves-logo.svg", price: 120.5, prepMinutes: 15 },
    { kitchenId: A, img: "https://img.craves.test/biryani.webp", price: 260 },
    { kitchenId: B, img: "http://img.craves.test/plain.webp", price: 90 },
    { img: "https://img.craves.test/orphan.webp", price: 10 },
  ]);
  assert.deepEqual([...summaries.keys()], [A, B]);
  assert.deepEqual(summaries.get(A), { imageUrls: ["https://img.craves.test/biryani.webp"], preparationTimeLabel: "15–40 min", startingPriceLabel: "₹120.50" });
  assert.deepEqual(summaries.get(B), { imageUrls: [], preparationTimeLabel: null, startingPriceLabel: "₹90" });
});
