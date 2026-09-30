import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manager = readFileSync(
  new URL("../components/chef-subscription-plan-manager.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../app/chef/meal-plans/page.tsx", import.meta.url),
  "utf8",
);
const capacityContract = readFileSync(
  new URL("../lib/chef-subscription-capacity-contract.ts", import.meta.url),
  "utf8",
);

test("Chef meal plans expose the complete three-step workspace", () => {
  assert.match(manager, /Plan details/);
  assert.match(manager, /Build the meal schedule/);
  assert.match(manager, /Review & submit/);
  assert.match(manager, /Create new meal plan/);
  assert.match(manager, /Save & submit for approval/);
});

test("Chef meal plans use server-owned schedule and capacity contracts", () => {
  assert.match(manager, /\/api\/chef\/subscription-plans/);
  assert.match(manager, /\/api\/chef\/subscription-capacity/);
  assert.match(manager, /\/api\/chef\/subscription-capacity\/rules\/slots/);
  assert.match(manager, /parseChefCapacitySummary/);
  assert.match(manager, /generationLeadHours/);
});

test("Chef meal plans communicate review, locking and capacity states", () => {
  assert.match(manager, /PENDING_APPROVAL/);
  assert.match(manager, /REJECTED/);
  assert.match(manager, /Subscription sales are frozen/);
  assert.match(manager, /Schedule locked/);
  assert.match(manager, /Admin review note/);
  assert.match(manager, /Capacity matching this plan/);
});

test("Chef meal plan controls meet the accessibility target-size baseline", () => {
  assert.match(manager, /min-h-11/);
  assert.match(manager, /min-h-12/);
  assert.match(manager, /focus-visible:ring-2/);
  assert.match(manager, /aria-live="polite"/);
  assert.match(manager, /aria-label=\{\`Remove meal/);
});

test("Chef meal plans remain reachable from Chef workspace navigation", () => {
  const navigation = readFileSync(
    new URL("../components/chef-workspace-navigation.tsx", import.meta.url),
    "utf8",
  );
  assert.match(navigation, /href: "\/chef\/meal-plans"/);
  assert.match(navigation, /label: "Meal Plans"/);
  assert.match(page, /ChefSubscriptionPlanManager/);
});

test("Chef capacity contract supports recurring and date-specific rules", () => {
  assert.match(capacityContract, /ChefCapacitySlotRule/);
  assert.match(capacityContract, /ChefCapacityMenuRule/);
  assert.match(capacityContract, /ChefCapacityDateOverride/);
  assert.match(capacityContract, /ChefCapacityMenuDateOverride/);
  assert.match(capacityContract, /subscriptionCapacityUnits/);
  assert.match(capacityContract, /recurringDeficitUnits/);
});
