import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const manager = source("../components/chef-subscription-plan-manager.tsx");
const editor = source("../components/chef-meal-plan-editor.tsx");
const api = source("../api/chef-meal-plans.ts");
const page = source("../../../app/chef/meal-plans/page.tsx");
const capacityContract = source("./chef-subscription-capacity-contract.ts");

test("Chef meal plans have the app's three-step editor", () => {
  assert.match(editor, /Next: Meals/);
  assert.match(editor, /Next: Review/);
  assert.match(editor, /Submit for approval/);
  assert.match(editor, /Save as draft\?/);
  assert.match(editor, /Copy \$\{dayLong\} to all weekdays/);
  assert.match(manager, /New plan/);
});

test("Chef meal plans use the server-owned plan, schedule, photo and switch routes", () => {
  for (const path of [
    "/api/chef/subscription-plans",
    "/schedule",
    "/image",
    "/accepting-subscribers",
    "/submit",
  ]) {
    assert.match(api, new RegExp(path.replaceAll("/", "\\/")), path);
  }
  assert.match(editor, /slotsToScheduleRequest\(slots, leadHours\)/);
});

test("Chef meal plans communicate review and locking states", () => {
  assert.match(manager, /PENDING_APPROVAL/);
  assert.match(manager, /REJECTED/);
  assert.match(editor, /Request a change/);
  assert.match(editor, /Change meal plan: \$\{planName\}/);
  assert.match(editor, /This plan is live\. To change something, send us a request\./);
});

test("Chef meal plan controls are keyboard and screen-reader friendly", () => {
  assert.match(editor, /role="tablist"/);
  assert.match(editor, /onKeyDown=\{onDayKey\}/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /aria-label=\{`Remove \$\{label\.toLowerCase\(\)\}`\}/);
  assert.match(manager, /role="status"/);
});

test("Chef meal plans open from More and from the Menu tab", () => {
  const more = source("../../../app/chef/profile/page.tsx");
  assert.match(more, /href: "\/chef\/meal-plans"/);
  assert.match(more, /label: "Meal plans"/);
  assert.match(page, /<ChefSubscriptionPlanManager \/>/);
  assert.match(
    source("../../../app/chef/menu/page.tsx"),
    /<ChefSubscriptionPlanManager inMenu \/>/,
  );
  assert.match(source("../components/chef-menu-views.tsx"), /\/chef\/menu\?view=plans/);
});

test("Chef capacity contract supports recurring and date-specific rules", () => {
  assert.match(capacityContract, /ChefCapacitySlotRule/);
  assert.match(capacityContract, /ChefCapacityMenuRule/);
  assert.match(capacityContract, /ChefCapacityDateOverride/);
  assert.match(capacityContract, /ChefCapacityMenuDateOverride/);
  assert.match(capacityContract, /subscriptionCapacityUnits/);
  assert.match(capacityContract, /recurringDeficitUnits/);
});
