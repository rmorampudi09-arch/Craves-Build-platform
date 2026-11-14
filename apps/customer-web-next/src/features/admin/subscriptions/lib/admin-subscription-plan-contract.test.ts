import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminSubscriptionPlan, parseAdminSubscriptionPlans, parseApprovedChefReferences, PLAN_PERIOD_WORDS } from "./admin-subscription-plan-contract.ts";

test("parses exact subscription plan states and amounts", () => {
  const parsed = parseAdminSubscriptionPlan({ id: "11111111-1111-4111-8111-111111111111", planCode: "WEEKLY-01", chefIdentityId: null, name: "Weekly meals", description: null, billingPeriod: "WEEKLY", amount: 1200, currency: "INR", status: "DRAFT", createdAt: "2026-07-30T00:00:00Z", updatedAt: "2026-07-30T00:00:00Z" });
  assert.equal(parsed?.amount, 1200);
  assert.equal(parseAdminSubscriptionPlan({ ...parsed, status: "DELETED" }), null);
});

test("approved chef selector accepts only approved applications", () => {
  const approved = parseApprovedChefReferences([{ id: "22222222-2222-4222-8222-222222222222", identityId: "33333333-3333-4333-8333-333333333333", firstName: "Home", lastName: "Chef", email: "chef@example.com", status: "APPROVED" }]);
  assert.equal(approved?.[0].displayName, "Home Chef");
  assert.equal(parseApprovedChefReferences([{ id: "22222222-2222-4222-8222-222222222222", identityId: "33333333-3333-4333-8333-333333333333", firstName: "Home", lastName: "Chef", email: "chef@example.com", status: "PENDING" }]), null);
});

test("a 14-day (fortnightly) plan is valid, so one no longer empties the whole admin plan list", () => {
  const plan = { id: "44444444-4444-4444-8444-444444444444", planCode: "FORTNIGHT-01", chefIdentityId: "33333333-3333-4333-8333-333333333333", name: "Fortnight tiffin",
    description: null, billingPeriod: "FORTNIGHTLY", amount: 2400, currency: "INR", status: "PENDING_APPROVAL", createdAt: "2026-11-13T10:00:00Z", updatedAt: "2026-11-13T10:00:00Z" };
  assert.equal(parseAdminSubscriptionPlan(plan)?.billingPeriod, "FORTNIGHTLY");
  assert.equal(parseAdminSubscriptionPlans([plan, { ...plan, id: "55555555-5555-4555-8555-555555555555", billingPeriod: "WEEKLY" }])?.length, 2);
  assert.equal(parseAdminSubscriptionPlan({ ...plan, billingPeriod: "DAILY" }), null);
  assert.equal(PLAN_PERIOD_WORDS.FORTNIGHTLY, "Every 2 weeks");
});
