import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("chef workspace navigation and the More hub expose every implemented backend area", () => {
  const navigation = source("../components/chef-workspace-navigation.tsx");
  const more = source("../../../app/chef/profile/page.tsx");
  const earnings = source("../../../app/chef/earnings/page.tsx");
  for (const route of ["/chef", "/chef/orders", "/chef/menu", "/chef/earnings", "/chef/profile"]) {
    assert.match(navigation, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  assert.match(navigation, /label: "More"/);
  for (const route of [
    "/chef/kitchen",
    "/chef/meal-plans",
    "/chef/operations",
    "/chef/earnings",
    "/chef/finance",
    "/chef/bank",
    "/chef/statements",
    "/chef/application/status",
    "/chef/notifications",
    "/chef/support",
    "/chef/capacity",
    "/chef/documents",
    "/chef/security",
    "/chef/referrals",
    "/chef/preferences",
    "/chef/earnings/payouts",
    "/chef/operations#chef-hours",
  ]) {
    assert.match(more, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  assert.match(more, /Switch to customer app/);
  assert.match(more, /Sign out/);
  assert.doesNotMatch(more, /not available yet/i);
  assert.match(earnings, /href="\/chef\/finance"/);
  assert.match(earnings, /Balance &amp; payouts/);
  // Earnings leads to every money page, and each money page leads back to it.
  assert.match(earnings, /href: "\/chef\/statements"/);
  assert.match(earnings, /href: "\/chef\/bank"/);
  for (const page of ["finance", "statements", "bank"]) {
    assert.match(source(`../../../app/chef/${page}/page.tsx`), /back=\{\{\s*href: "\/chef\/earnings", label: "Earnings"\s*\}\}/, page);
  }
});

test("pages that are not tabs keep an obvious way back", () => {
  for (const [page, href] of [["operations", "/chef/profile"], ["notifications", "/chef"]]) {
    assert.match(source(`../../../app/chef/${page}/page.tsx`), new RegExp(`back=\\{\\{\\s*href: "${href.replaceAll("/", "\\/")}"`), page);
  }
  // Daily limits goes back to where it was opened: a plan card in Meal plans or in Menu, or More.
  const capacity = source("../../../app/chef/capacity/page.tsx");
  for (const href of ["/chef/profile", "/chef/menu?view=plans", "/chef/meal-plans"]) assert.ok(capacity.includes(`{ href: "${href}"`), href);
  assert.match(capacity, /back=\{back\}/);
  // Meal plans swap their header for the plan editor, so the list draws it.
  assert.match(source("../components/chef-subscription-plan-manager.tsx"), /back=\{\{ href: "\/chef\/profile", label: "More" \}\}/);
  assert.match(source("../../../app/chef/support/page.tsx"), /\{ href: "\/chef\/profile", label: "More" \}/);
  assert.match(source("../components/chef-kitchen-form.tsx"), /PAGE_BACK = \{ href: "\/chef\/profile", label: "More" \}/);
  assert.match(source("../components/chef-order-details.tsx"), /back=\{\{ href: "\/chef\/orders", label: "Orders" \}\}/);
});

test("dashboard loads only live chef service state", () => {
  const dashboard = source("../components/chef-mode-dashboard.tsx");
  for (const endpoint of [
    "/api/chef/application",
    "/api/chef/kitchen",
    "/api/chef/menu",
    "/api/chef/orders",
    "/api/chef/earnings",
  ]) {
    assert.match(dashboard, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(dashboard, /Promise\.allSettled/);
  assert.doesNotMatch(dashboard, /estimatedRevenue|mock|demo|sample/i);
});

test("operations readiness uses supported backend controls only", () => {
  const operations = source("../components/chef-operations-workspace.tsx");
  assert.match(operations, /applicationApproved/);
  assert.match(operations, /kitchen\?\.status === "ACTIVE"/);
  assert.match(operations, /item\.status === "ACTIVE"/);
  assert.match(operations, /item\.available/);
  assert.match(operations, /parseChefApplicationReadiness/);
  assert.match(operations, /approvedDocumentCount/);
  assert.match(operations, /\/api\/chef\/application\/readiness/);
  // Opening hours come from the kitchen schedule, not from anything made up on the screen.
  assert.match(operations, /<ChefOpeningHours \/>/);
  assert.match(source("../api/chef-kitchen-schedule.ts"), /"\/api\/chef\/kitchen\/schedule"/);
  assert.doesNotMatch(operations, /FSSAI.*required|commissionRate|deliveryRadius\s*=/i);
});

test("chef earnings remain finance-owned and contract validated", () => {
  const ledger = source("../components/chef-earnings-ledger.tsx");
  const route = source("../../../app/api/chef/earnings/route.ts");
  assert.match(route, /parseChefEarnings\(raw\)/);
  assert.match(route, /authenticatedApiFetch\(request, "\/chef\/earnings\?limit=200"\)/);
  // Fees are shown from each recorded entry, never calculated in the browser.
  assert.match(ledger, /entry\.commissionAmount/);
  assert.doesNotMatch(ledger, /commissionRate|platformCommission|initiatePayout/i);
});

test("chef order BFF accepts known deployed envelopes without weakening records", () => {
  const contract = source("./chef-order-contract.ts");
  const listRoute = source("../../../app/api/chef/orders/route.ts");
  const detailRoute = source("../../../app/api/chef/orders/[orderId]/route.ts");
  assert.match(contract, /parseChefOrdersResponse/);
  assert.match(contract, /\["orders", "content", "data"\]/);
  assert.match(contract, /parseChefOrderResponse/);
  assert.match(listRoute, /parseChefOrdersResponse\(raw\)/);
  assert.match(detailRoute, /parseChefOrderResponse\(raw\)/);
  assert.match(contract, /items\.some\(\(item\) => item === null\)/);
  assert.doesNotMatch(contract, /customerIdentityId|pickupAddress/);
});

test("chef order actions use unique idempotency keys and strict responses", () => {
  const actions = source("../components/chef-order-actions.tsx");
  const acceptRoute = source(
    "../../../app/api/chef/orders/[orderId]/accept/route.ts",
  );
  const rejectRoute = source(
    "../../../app/api/chef/orders/[orderId]/reject/route.ts",
  );
  assert.match(actions, /crypto\.randomUUID\(\)/);
  assert.match(actions, /parseChefOrderResponse\(result\)/);
  assert.match(acceptRoute, /"Idempotency-Key": actionId/);
  assert.match(rejectRoute, /"Idempotency-Key": actionId/);
});

test("chef pages render their headers only after the access check", () => {
  for (const [page, header] of [["capacity", "<ChefPageHeader"], ["meal-plans", "<ChefSubscriptionPlanManager"], ["operations", "<ChefPageHeader"], ["finance", "<ChefPageHeader"], ["statements", "<ChefPageHeader"], ["profile", "<ChefPageHeader"], ["earnings", "<ChefPageHeader"]]) {
    const contents = source(`../../../app/chef/${page}/page.tsx`);
    const boundary = contents.indexOf("<ChefAccessBoundary>");
    assert.ok(boundary >= 0 && boundary < contents.indexOf(header), page);
  }
});
