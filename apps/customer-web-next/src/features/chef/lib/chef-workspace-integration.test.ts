import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("chef workspace navigation and the More hub expose every implemented backend area", () => {
  const navigation = source("../components/chef-workspace-navigation.tsx");
  const more = source("../components/chef-more-hub.tsx");
  const money = source("../../../app/chef/earnings/page.tsx");
  const moneyLinks = source("../components/chef-money-links.tsx");
  for (const route of ["/chef", "/chef/orders", "/chef/menu", "/chef/earnings", "/chef/profile"]) {
    assert.match(navigation, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  // The fourth tab is Money: it says what chefs come for.
  assert.match(navigation, /money: "Money"/);
  assert.match(navigation, /more: "More"/);
  // More groups the pages that are not tabs; Money and Meal plans live in their own tabs, Notifications behind the bell.
  for (const route of [
    "/chef/kitchen",
    "/chef/hours",
    "/chef/capacity",
    "/chef/operations",
    "/chef/documents",
    "/chef/preferences",
    "/chef/support",
    "/chef/referrals",
    "/chef/security",
    "/chef/application/status",
  ]) {
    assert.match(more, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  for (const route of ["/chef/earnings", "/chef/finance", "/chef/statements", "/chef/meal-plans", "/chef/notifications"]) {
    assert.doesNotMatch(more, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  assert.match(more, /Switch to customer app/);
  assert.match(more, /Sign out/);
  assert.match(more, /LanguageSheet/);
  assert.doesNotMatch(more, /not available yet/i);
  // Money opens on the balance and its send button, then leads to every money page; each money page leads back.
  assert.match(money, /<ChefWithdrawalPanel compact \/>/);
  assert.match(source("../components/chef-withdrawal-panel.tsx"), /href="\/chef\/finance"/);
  for (const route of ["/chef/earnings/payouts", "/chef/earnings/orders", "/chef/statements", "/chef/bank"]) {
    assert.match(moneyLinks, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  for (const page of ["finance", "statements", "bank", "earnings/payouts", "earnings/orders"]) {
    assert.match(source(`../../../app/chef/${page}/page.tsx`), /back=\{\{\s*href: "\/chef\/earnings", label: "Money"\s*\}\}/, page);
  }
  // Meal plans are a view of the Menu tab.
  assert.match(source("../components/chef-menu-views.tsx"), /"\/chef\/menu\?view=plans"/);
});

test("pages that are not tabs keep an obvious way back", () => {
  for (const [page, href] of [["operations", "/chef/profile"], ["hours", "/chef/profile"], ["preferences", "/chef/profile"], ["notifications", "/chef"], ["support", "/chef/profile"]]) {
    assert.match(source(`../../../app/chef/${page}/page.tsx`), new RegExp(`back=\\{\\{\\s*href: "${href.replaceAll("/", "\\/")}"`), page);
  }
  // Daily limits goes back to where it was opened: a plan card in Meal plans or in Menu, the Menu tab, or More.
  const capacity = source("../../../app/chef/capacity/page.tsx");
  for (const href of ["/chef/profile", "/chef/menu?view=plans", "/chef/meal-plans", "/chef/menu"]) assert.ok(capacity.includes(`{ href: "${href}"`), href);
  assert.match(capacity, /back=\{back\}/);
  // Meal plans swap their header for the plan editor, so the list draws it; they belong to the Menu tab.
  assert.match(source("../components/chef-subscription-plan-manager.tsx"), /back=\{\{ href: "\/chef\/menu\?view=plans", label: "Menu" \}\}/);
  assert.match(source("../components/chef-kitchen-form.tsx"), /PAGE_BACK = \{ href: "\/chef\/profile", label: "More" \}/);
  assert.match(source("../components/chef-order-details.tsx"), /back=\{\{ href: "\/chef\/orders", label: text\.orders \}\}/);
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
  // Opening hours have their own page (they vanished whenever this check failed); this page links to it.
  assert.match(operations, /href="\/chef\/hours"/);
  assert.match(source("../../../app/chef/hours/page.tsx"), /<ChefOpeningHours \/>/);
  // A failed document check never hides the kitchen: readiness is optional on this page.
  assert.match(operations, /readinessResponse\.ok \? parseChefApplicationReadiness\(readinessRaw\) : null/);
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
