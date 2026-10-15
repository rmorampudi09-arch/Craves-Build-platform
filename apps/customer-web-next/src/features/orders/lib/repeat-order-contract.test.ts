import assert from "node:assert/strict";
import test from "node:test";
import {
  familiarityLabel,
  parseCartForReorder,
  parseRepeatOrderPage,
  parseReorderCartRequest,
  previousOrderTotalLabel,
  rankRepeatOrderCandidates,
  repeatOrderBasketSummary,
  type RepeatOrderCandidate,
} from "./repeat-order-contract.ts";

// Synthetic ids, shaped like order-service RepeatOrderCandidate.
const KITCHEN = "4a000000-0000-4000-8000-000000000001";
const candidate = {
  orderId: "0bde0000-0000-4000-8000-000000000101",
  kitchenId: KITCHEN,
  kitchenName: "Relangi",
  lastOrderedAt: "2026-10-10T07:12:00Z",
  completedOrdersFromKitchen: 3,
  items: [
    { menuItemId: "0bde0000-0000-4000-8000-000000000201", itemName: "Veg thali", quantity: 2 },
  ],
  previousOrderTotal: 248.5,
  previousOrderCurrency: "INR",
  orderLikeLastTimeAvailable: true,
  preferenceRecallSupported: false,
  rememberedPreferenceCount: 0,
  currentValidationNotice:
    "Current menu availability and price are validated when rebuilding the cart.",
};
const page = (items: unknown[], nextCursor: string | null = null, hasMore = false) => ({
  items,
  nextCursor,
  hasMore,
});

test("keeps a valid page of previous baskets", () => {
  const parsed = parseRepeatOrderPage(
    page([candidate, { ...candidate, previousOrderTotal: "1240.00" }], "b3JkZXI", true),
  );
  assert.equal(parsed?.items.length, 2);
  assert.deepEqual(parsed?.items[0], {
    orderId: candidate.orderId,
    kitchenId: KITCHEN,
    kitchenName: "Relangi",
    lastOrderedAt: candidate.lastOrderedAt,
    completedOrdersFromKitchen: 3,
    items: candidate.items,
    previousOrderTotal: "248.5",
    previousOrderCurrency: "INR",
    preferenceRecallSupported: false,
    currentValidationNotice: candidate.currentValidationNotice,
  });
  assert.equal(parsed?.items[1].previousOrderTotal, "1240.00");
  assert.equal(parsed?.nextCursor, "b3JkZXI");
});

test("rejects a page it cannot trust", () => {
  for (const broken of [
    page([{ ...candidate, orderLikeLastTimeAvailable: false }]),
    page([{ ...candidate, items: [] }]),
    page([{ ...candidate, items: [{ ...candidate.items[0], quantity: 0 }] }]),
    page([{ ...candidate, orderId: "nope" }]),
    page([{ ...candidate, previousOrderTotal: "-1" }]),
    page([{ ...candidate, previousOrderCurrency: "inr" }]),
    page([{ ...candidate, completedOrdersFromKitchen: 0 }]),
    page([candidate], null, true),
    page([candidate], "b3JkZXI", false),
    page([candidate], "not/base64url", true),
    page(Array.from({ length: 51 }, () => candidate)),
    null,
  ])
    assert.equal(parseRepeatOrderPage(broken), null, JSON.stringify(broken)?.slice(0, 120));
});

test("checks the conditional reorder body", () => {
  const line = {
    id: "0bde0000-0000-4000-8000-000000000301",
    quantity: 2,
    updatedAt: "2026-10-15T08:00:00Z",
  };
  const body = {
    expectedCart: { cartId: "0bde0000-0000-4000-8000-000000000401", items: [line] },
    expectedKitchenId: KITCHEN,
    extra: "dropped",
  };
  assert.deepEqual(parseReorderCartRequest(body), {
    expectedCart: body.expectedCart,
    expectedKitchenId: KITCHEN,
  });
  assert.deepEqual(
    parseReorderCartRequest({ ...body, expectedCart: { ...body.expectedCart, items: [] } })
      ?.expectedCart.items,
    [],
  );
  for (const broken of [
    { ...body, expectedKitchenId: "nope" },
    { ...body, expectedCart: { ...body.expectedCart, cartId: null } },
    { ...body, expectedCart: { ...body.expectedCart, items: [line, line] } },
    { ...body, expectedCart: { ...body.expectedCart, items: [{ ...line, quantity: 101 }] } },
    {
      ...body,
      expectedCart: { ...body.expectedCart, items: [{ ...line, updatedAt: "yesterday" }] },
    },
    {
      ...body,
      expectedCart: { ...body.expectedCart, items: Array.from({ length: 201 }, () => line) },
    },
  ])
    assert.equal(parseReorderCartRequest(broken), null);
});

test("reads the cart as the conditional reorder expects it to still be", () => {
  const cartId = "0bde0000-0000-4000-8000-000000000401";
  const line = {
    id: "0bde0000-0000-4000-8000-000000000302",
    quantity: 2,
    updatedAt: "2026-10-15T08:00:00.123456Z",
  };
  assert.deepEqual(parseCartForReorder({ id: cartId, items: [] }), { cartId, items: [] });
  assert.deepEqual(
    parseCartForReorder({ id: cartId, items: [{ ...line, itemName: "Veg thali" }] }),
    { cartId, items: [line] },
  );
  for (const broken of [
    { id: "nope", items: [] },
    { id: cartId },
    { id: cartId, items: [{ ...line, updatedAt: undefined }] },
    { id: cartId, items: [line, line] },
  ])
    assert.equal(parseCartForReorder(broken), null);
});

test("ranks favourite kitchens first, then the most-ordered kitchens, then the newest order", () => {
  const at = (
    orderId: string,
    completedOrdersFromKitchen: number,
    lastOrderedAt: string,
    kitchenId = "kitchen",
  ) =>
    ({
      ...candidate,
      orderId,
      kitchenId,
      completedOrdersFromKitchen,
      lastOrderedAt,
    }) as unknown as RepeatOrderCandidate;
  const baskets = [
    at("c", 1, "2026-10-14T00:00:00Z"),
    at("b", 4, "2026-10-01T00:00:00Z"),
    at("a", 4, "2026-10-09T00:00:00Z"),
    at("d", 4, "2026-10-09T00:00:00Z"),
    at("f", 1, "2026-09-01T00:00:00Z", "favourite"),
  ];
  assert.deepEqual(
    rankRepeatOrderCandidates(baskets, new Set()).map((item) => item.orderId),
    ["a", "d", "b", "c", "f"],
  );
  assert.deepEqual(
    rankRepeatOrderCandidates(baskets, new Set(["favourite"])).map((item) => item.orderId),
    ["f", "a", "d", "b", "c"],
  );
});

test("labels the basket like the app", () => {
  const items = [
    { menuItemId: candidate.items[0].menuItemId, itemName: "Veg thali", quantity: 2 },
    { menuItemId: candidate.items[0].menuItemId, itemName: "Curd rice", quantity: 1 },
    { menuItemId: candidate.items[0].menuItemId, itemName: "Gulab jamun", quantity: 3 },
  ];
  const basket = {
    ...candidate,
    items,
    previousOrderTotal: "1240.5",
  } as unknown as RepeatOrderCandidate;
  assert.equal(repeatOrderBasketSummary(basket), "2× Veg thali, Curd rice +1 more");
  assert.equal(previousOrderTotalLabel(basket), "Previous total ₹1,240.5");
  assert.equal(
    previousOrderTotalLabel({ ...basket, previousOrderCurrency: "USD" }),
    "Previous total USD 1,240.5",
  );
  assert.equal(familiarityLabel(basket), "Ordered from this kitchen 3 times");
  assert.equal(
    familiarityLabel({ ...basket, completedOrdersFromKitchen: 1 }),
    "Ordered from this kitchen once",
  );
});
