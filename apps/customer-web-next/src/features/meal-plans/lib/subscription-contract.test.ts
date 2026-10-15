import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerSubscription, parsePublicSubscriptionPlan, parsePublicSubscriptionPlans } from "./subscription-contract.ts";
import { billingPeriodLabel, billingUnit, weeksPerBill } from "./meal-plan-schedule.ts";

const plan = {
  id: "11111111-1111-4111-8111-111111111111",
  planCode: "WEEKLY-01",
  chefIdentityId: "22222222-2222-4222-8222-222222222222",
  name: "Weekly meals",
  description: "Fresh meals",
  billingPeriod: "WEEKLY",
  amount: 1200,
  currency: "INR"
};

test("parses public plan without internal chef identity", () => {
  const parsed = parsePublicSubscriptionPlan(plan);
  assert.equal(parsed?.name, "Weekly meals");
  assert.equal("chefIdentityId" in (parsed ?? {}), false);
});

test("rejects unsupported billing period", () => {
  assert.equal(parsePublicSubscriptionPlan({ ...plan, billingPeriod: "DAILY" }), null);
});

test("a 14-day plan parses and is billed per 14 days", () => {
  const parsed = parsePublicSubscriptionPlan({ ...plan, billingPeriod: "FORTNIGHTLY" });
  assert.equal(parsed?.billingPeriod, "FORTNIGHTLY");
  assert.deepEqual([billingPeriodLabel("FORTNIGHTLY"), billingUnit("FORTNIGHTLY"), weeksPerBill(billingUnit("FORTNIGHTLY"))], ["14 days", "14 days", 2]);
  assert.deepEqual([billingUnit("WEEKLY"), billingUnit("MONTHLY"), weeksPerBill("28 days")], ["week", "28 days", 4]);
});

test("one malformed plan is dropped and the rest of the list survives", () => {
  const second = { ...plan, id: "55555555-5555-4555-8555-555555555555", billingPeriod: "FORTNIGHTLY" };
  const parsed = parsePublicSubscriptionPlans([plan, { ...plan, id: "not-a-uuid" }, { ...plan, billingPeriod: "DAILY" }, null, second]);
  assert.deepEqual(parsed?.map(item => item.id), [plan.id, second.id]);
  assert.equal(parsePublicSubscriptionPlans({ plans: [plan] }), null);
});

test("customer subscription excludes identity ids", () => {
  const parsed = parseCustomerSubscription({
    id: "33333333-3333-4333-8333-333333333333",
    planId: plan.id,
    customerIdentityId: "44444444-4444-4444-8444-444444444444",
    chefIdentityId: plan.chefIdentityId,
    status: "ACTIVE",
    startDate: "2026-08-01",
    endDate: null,
    nextServiceDate: "2026-08-02",
    deliveryAddressId: null,
    notes: null,
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z"
  });
  assert.equal("customerIdentityId" in (parsed ?? {}), false);
  assert.equal("chefIdentityId" in (parsed ?? {}), false);
});

test("customer subscription keeps its own plan name for plans no longer listed", () => {
  const parsed = parseCustomerSubscription({
    id: "33333333-3333-4333-8333-333333333333",
    planId: plan.id,
    status: "ACTIVE",
    startDate: "2026-08-01",
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
    planName: "Weekly thali"
  });
  assert.equal(parsed?.planName, "Weekly thali");
  assert.equal(parseCustomerSubscription({ ...parsed, planName: undefined })?.planName, null);
});
