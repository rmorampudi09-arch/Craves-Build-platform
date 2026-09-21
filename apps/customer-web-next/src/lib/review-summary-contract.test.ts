import assert from "node:assert/strict";
import test from "node:test";

import { parseKitchenReviewSummary } from "./review-summary-contract.ts";

const kitchenId = "123e4567-e89b-12d3-a456-426614174000";

test("parses a published kitchen review summary", () => {
  assert.deepEqual(
    parseKitchenReviewSummary({
      kitchenId,
      reviewCount: 12,
      overallAverage: 4.6,
    }),
    {
      kitchenId,
      reviewCount: 12,
      overallAverage: 4.6,
    },
  );
});

test("accepts a zero-review summary without inventing a rating", () => {
  assert.deepEqual(
    parseKitchenReviewSummary({
      kitchenId,
      reviewCount: 0,
      overallAverage: null,
    }),
    {
      kitchenId,
      reviewCount: 0,
      overallAverage: null,
    },
  );
});

test("rejects contradictory or unsafe review summaries", () => {
  assert.equal(
    parseKitchenReviewSummary({
      kitchenId,
      reviewCount: 0,
      overallAverage: 4.5,
    }),
    null,
  );
  assert.equal(
    parseKitchenReviewSummary({
      kitchenId,
      reviewCount: 2,
      overallAverage: null,
    }),
    null,
  );
  assert.equal(
    parseKitchenReviewSummary({
      kitchenId: "not-a-uuid",
      reviewCount: 2,
      overallAverage: 4.5,
    }),
    null,
  );
});
