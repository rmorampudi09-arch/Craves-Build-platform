import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerReview, parseReviewTags } from "./review-contract.ts";

const review = {
  reviewId: "71111111-2222-4333-8444-555555555555",
  orderId: "11111111-2222-4333-8444-555555555555",
  kitchenId: "41111111-2222-4333-8444-555555555555",
  status: "PENDING_MODERATION",
  version: 2,
  overallRating: 4,
  foodTasteRating: 5,
  portionValueRating: null,
  packagingRating: null,
  accuracyRating: null,
  chefPreparationRating: null,
  deliveryRating: null,
  reviewText: "Lovely biryani",
  tagCodes: ["TASTY", "WELL_PACKED"],
  mediaAssetIds: [],
  helpfulCount: 3,
  submittedAt: "2026-10-10T08:00:00.123456Z",
  updatedAt: "2026-10-10T09:00:00Z",
  publishedAt: null,
};

test("keeps the customer's own review fields and nothing else", () => {
  const parsed = parseCustomerReview({ ...review, customerIdentityId: "secret" });
  assert.equal(parsed?.overallRating, 4);
  assert.equal(parsed?.foodTasteRating, 5);
  assert.deepEqual(parsed?.tagCodes, ["TASTY", "WELL_PACKED"]);
  assert.equal("customerIdentityId" in (parsed ?? {}), false);
  assert.equal("helpfulCount" in (parsed ?? {}), false);
  // What the BFF sends on parses the same in the browser.
  assert.deepEqual(parseCustomerReview(parsed), parsed);
});

test("only a published review carries a publish date", () => {
  assert.ok(
    parseCustomerReview({ ...review, status: "PUBLISHED", publishedAt: "2026-10-11T08:00:00Z" }),
  );
  assert.equal(parseCustomerReview({ ...review, status: "PUBLISHED" }), null);
  assert.equal(parseCustomerReview({ ...review, publishedAt: "2026-10-11T08:00:00Z" }), null);
});

test("rejects reviews outside order-service's limits", () => {
  for (const broken of [
    { overallRating: 0 },
    { overallRating: 6 },
    { overallRating: 4.5 },
    { foodTasteRating: 7 },
    { status: "DELETED" },
    { version: 0 },
    { reviewText: "x".repeat(2001) },
    { tagCodes: ["tasty"] },
    { tagCodes: ["TASTY", "TASTY"] },
    { tagCodes: Array.from({ length: 11 }, (_, index) => `TAG_${index}`) },
    { mediaAssetIds: ["not-a-uuid"] },
    { orderId: "bad" },
    { submittedAt: "yesterday" },
  ]) {
    assert.equal(parseCustomerReview({ ...review, ...broken }), null, JSON.stringify(broken));
  }
  assert.equal(parseCustomerReview([review]), null);
});

test("lists active tags in the admin's order and rejects a broken list", () => {
  const tag = (code: string, sortOrder: number, active = true) => ({
    code,
    displayLabel: ` ${code.toLowerCase()} `,
    dimension: "OVERALL",
    active,
    sortOrder,
    updatedAt: "2026-10-10T08:00:00Z",
  });
  const tags = parseReviewTags([
    tag("WELL_PACKED", 2),
    tag("TASTY", 1),
    tag("OLD", 0, false),
    tag("AB", 2),
  ]);
  assert.deepEqual(tags, [
    { code: "TASTY", displayLabel: "tasty", sortOrder: 1 },
    { code: "AB", displayLabel: "ab", sortOrder: 2 },
    { code: "WELL_PACKED", displayLabel: "well_packed", sortOrder: 2 },
  ]);
  assert.deepEqual(parseReviewTags(tags), tags);
  assert.deepEqual(parseReviewTags([]), []);
  for (const broken of [
    { code: "bad code" },
    { displayLabel: " " },
    { sortOrder: 1.5 },
    { sortOrder: 100_001 },
    { active: "yes" },
  ]) {
    assert.equal(
      parseReviewTags([{ ...tag("TASTY", 1), ...broken }]),
      null,
      JSON.stringify(broken),
    );
  }
  assert.equal(parseReviewTags({ items: [] }), null);
});
