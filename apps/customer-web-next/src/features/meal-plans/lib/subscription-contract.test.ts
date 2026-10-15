import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerSubscription, parseDayCredit, parseDayCreditChoice, parsePublicSubscriptionPlan, parsePublicSubscriptionPlans } from "./subscription-contract.ts";
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

test("plan photos are https only; the server's own image path goes through our image route", () => {
  const own = `/api/subscriptions/plans/${plan.id}/image?v=1760000000`;
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: `/api/v1/subscriptions/plans/${plan.id.toUpperCase()}/image?v=1760000000` })?.imageUrl, own);
  // The browser reads the BFF's answer with the same parser.
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: own })?.imageUrl, own);
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: "/api/v1/subscriptions/plans/not-a-plan/image?v=1" })?.imageUrl, null);
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: "/api/v1/admin/secret" })?.imageUrl, null);
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: "https://cdn.craves.in/p.jpg" })?.imageUrl, "https://cdn.craves.in/p.jpg");
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: "http://cdn.craves.in/p.jpg" })?.imageUrl, null);
  assert.equal(parsePublicSubscriptionPlan({ ...plan, imageUrl: "javascript:alert(1)" })?.imageUrl, null);
  assert.equal(parsePublicSubscriptionPlan(plan)?.imageUrl, null);
});

test("the pause allowance is read when the server sends it", () => {
  const base = { id: "33333333-3333-4333-8333-333333333333", planId: plan.id, status: "PAUSED", startDate: "2026-08-01", createdAt: "2026-07-30T00:00:00Z", updatedAt: "2026-07-30T00:00:00Z" };
  const parsed = parseCustomerSubscription({ ...base, pauseDaysPerBill: 3, pauseDaysLeft: 0, pauseAutoResumeDate: "2026-08-10" });
  assert.deepEqual([parsed?.pauseDaysPerBill, parsed?.pauseDaysLeft, parsed?.pauseAutoResumeDate], [3, 0, "2026-08-10"]);
  const old = parseCustomerSubscription(base);
  assert.deepEqual([old?.pauseDaysPerBill, old?.pauseDaysLeft, old?.pauseAutoResumeDate], [null, null, null]);
  assert.equal(parseCustomerSubscription({ ...base, pauseDaysLeft: -1 })?.pauseDaysLeft, null);
});

test("the bill length, price and renewal date are read; an unreadable one is left out", () => {
  const base = { id: "33333333-3333-4333-8333-333333333333", planId: plan.id, status: "ACTIVE", startDate: "2026-08-01", createdAt: "2026-07-30T00:00:00Z", updatedAt: "2026-07-30T00:00:00Z" };
  const parsed = parseCustomerSubscription({ ...base, billingPeriod: "FORTNIGHTLY", amount: 2400, currency: "INR", nextBillingDate: "2026-08-15" });
  assert.deepEqual([parsed?.billingPeriod, parsed?.amount, parsed?.currency, parsed?.nextBillingDate], ["FORTNIGHTLY", 2400, "INR", "2026-08-15"]);
  const broken = parseCustomerSubscription({ ...base, billingPeriod: "DAILY", amount: "", currency: "rupees", nextBillingDate: "soon" });
  assert.deepEqual([broken?.billingPeriod, broken?.amount, broken?.currency, broken?.nextBillingDate], [null, null, null, null]);
  assert.equal(parseCustomerSubscription({ ...base, amount: "1499.50" })?.amount, 1499.5);
});

const credit = {
  id: "88888888-8888-4888-8888-888888888888", kind: "DECLINE", firstDate: "2026-10-14", lastDate: "2026-10-14", mealSlotCode: "LUNCH", days: null,
  status: "PENDING_CHOICE", refundAmount: null, currency: "INR", choiceDeadline: "2026-10-16T06:00:00Z", extendAvailable: true,
};

test("day credits parse, and one the web can't read is left out", () => {
  assert.deepEqual(parseDayCredit(credit), credit);
  assert.equal(parseDayCredit({ ...credit, refundAmount: "120.50" })?.refundAmount, 120.5);
  assert.equal(parseDayCredit({ ...credit, status: "REFUND_FAILED" })?.status, "REFUND_FAILED");
  for (const broken of [{ ...credit, kind: "BONUS" }, { ...credit, status: "LOST" }, { ...credit, id: "x" }, { ...credit, lastDate: "2026-10-13" },
    { ...credit, extendAvailable: "yes" }, { ...credit, days: 0 }, { ...credit, refundAmount: -1 }, { ...credit, choiceDeadline: "soon" }]) {
    assert.equal(parseDayCredit(broken), null);
  }
  const base = { id: "33333333-3333-4333-8333-333333333333", planId: plan.id, status: "ACTIVE", startDate: "2026-08-01", createdAt: "2026-07-30T00:00:00Z", updatedAt: "2026-07-30T00:00:00Z" };
  assert.deepEqual(parseCustomerSubscription({ ...base, dayCredits: [credit, { ...credit, kind: "BONUS" }] })?.dayCredits, [credit]);
  assert.deepEqual(parseCustomerSubscription(base)?.dayCredits, []);
});

test("a day credit choice is REFUND or EXTEND and nothing else", () => {
  assert.deepEqual(parseDayCreditChoice({ choice: "REFUND" }), { choice: "REFUND" });
  assert.deepEqual(parseDayCreditChoice({ choice: "EXTEND" }), { choice: "EXTEND" });
  for (const bad of [null, {}, { choice: "refund" }, { choice: "EXTEND", days: 3 }, "EXTEND"]) assert.equal(parseDayCreditChoice(bad), null);
});
