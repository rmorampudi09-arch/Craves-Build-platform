import assert from "node:assert/strict";
import test from "node:test";
import { parseChefReviewPage, parseChefReviewSummary } from "./chef-review-contract.ts";

const KITCHEN = "11111111-1111-4111-8111-111111111111";
// What order-service's PublicReviewView sends; the extra ratings and media are dropped.
const review = {
  reviewId: "22222222-2222-4222-8222-222222222222", kitchenId: KITCHEN, overallRating: 4, foodTasteRating: 5, portionValueRating: null,
  packagingRating: null, accuracyRating: null, chefPreparationRating: null, deliveryRating: null, reviewText: "Tasty  ",
  tagCodes: ["ON_TIME"], mediaAssetIds: [], helpfulCount: 0, publishedAt: "2026-10-20T10:00:00Z",
};

test("a review page keeps what the chef sees and needs a cursor to say there is more", () => {
  assert.deepEqual(parseChefReviewPage({ items: [review], nextCursor: "MjAyNi0xMC0yMFQxMDowMDowMFp8eA", hasMore: true }), {
    items: [{ reviewId: review.reviewId, kitchenId: KITCHEN, overallRating: 4, reviewText: "Tasty", tagCodes: ["ON_TIME"], publishedAt: review.publishedAt }],
    nextCursor: "MjAyNi0xMC0yMFQxMDowMDowMFp8eA",
    hasMore: true,
  });
  assert.equal(parseChefReviewPage({ items: [{ ...review, reviewText: "" }], nextCursor: null, hasMore: false })?.items[0]?.reviewText, null);
  for (const bad of [
    { items: [review], nextCursor: null, hasMore: true },
    { items: [{ ...review, overallRating: 6 }], nextCursor: null, hasMore: false },
    { items: [{ ...review, overallRating: 4.5 }], nextCursor: null, hasMore: false },
    { items: [{ ...review, tagCodes: ["on time"] }], nextCursor: null, hasMore: false },
    { items: [{ ...review, publishedAt: "soon" }], nextCursor: null, hasMore: false },
    { items: [review], nextCursor: "a/b", hasMore: true },
    { items: "none", nextCursor: null, hasMore: false },
  ]) assert.equal(parseChefReviewPage(bad), null, JSON.stringify(bad).slice(0, 80));
});

test("a summary has an average exactly when it has reviews", () => {
  assert.deepEqual(parseChefReviewSummary({ kitchenId: KITCHEN, reviewCount: 12, overallAverage: 4.58, foodTasteAverage: null }), { kitchenId: KITCHEN, reviewCount: 12, overallAverage: 4.58 });
  assert.equal(parseChefReviewSummary({ kitchenId: KITCHEN, reviewCount: 3, overallAverage: "4.33" })?.overallAverage, 4.33);
  assert.equal(parseChefReviewSummary({ kitchenId: KITCHEN, reviewCount: 0, overallAverage: null })?.overallAverage, null);
  for (const bad of [
    { kitchenId: KITCHEN, reviewCount: 0, overallAverage: 4 },
    { kitchenId: KITCHEN, reviewCount: 2, overallAverage: null },
    { kitchenId: KITCHEN, reviewCount: 2, overallAverage: true },
    { kitchenId: KITCHEN, reviewCount: 2, overallAverage: 5.5 },
    { kitchenId: "kitchen", reviewCount: 2, overallAverage: 4 },
  ]) assert.equal(parseChefReviewSummary(bad), null, JSON.stringify(bad));
});
