import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("chef workspace navigation and the More hub expose every implemented backend area", () => {
  const navigation = source("../components/chef-workspace-navigation.tsx");
  const more = source("../app/chef/profile/page.tsx");
  const earnings = source("../app/chef/earnings/page.tsx");
  for (const route of ["/chef", "/chef/orders", "/chef/menu", "/chef/earnings", "/chef/profile"]) {
    assert.match(navigation, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  assert.match(navigation, /label: "More"/);
  for (const route of [
    "/chef/kitchen",
    "/chef/menu/media",
    "/chef/meal-plans",
    "/chef/capacity",
    "/chef/operations",
    "/chef/earnings",
    "/chef/finance",
    "/chef/statements",
    "/chef/application/status",
    "/chef/notifications",
    "/contact",
  ]) {
    assert.match(more, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`), route);
  }
  assert.match(more, /Switch to customer app/);
  assert.match(more, /Sign out/);
  assert.doesNotMatch(more, /not available yet/i);
  assert.match(earnings, /href="\/chef\/finance"/);
  assert.match(earnings, /Open your available balance/);
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
  assert.match(operations, /no reviewed weekly opening-hours contract/i);
  assert.doesNotMatch(operations, /FSSAI.*required|commissionRate|deliveryRadius\s*=/i);
});

test("chef earnings remain finance-owned and contract validated", () => {
  const ledger = source("../components/chef-earnings-ledger.tsx");
  const route = source("../app/api/chef/earnings/route.ts");
  assert.match(route, /parseChefEarnings\(raw\)/);
  assert.match(route, /authenticatedApiFetch\(request, "\/chef\/earnings\?limit=200"\)/);
  assert.match(ledger, /browser never calculates commission/i);
  assert.doesNotMatch(ledger, /commissionRate|platformCommission|initiatePayout/i);
});

test("chef order BFF accepts known deployed envelopes without weakening records", () => {
  const contract = source("./chef-order-contract.ts");
  const listRoute = source("../app/api/chef/orders/route.ts");
  const detailRoute = source("../app/api/chef/orders/[orderId]/route.ts");
  assert.match(contract, /parseChefOrdersResponse/);
  assert.match(contract, /\["orders", "content", "data"\]/);
  assert.match(contract, /parseChefOrderResponse/);
  assert.match(listRoute, /parseChefOrdersResponse\(raw\)/);
  assert.match(detailRoute, /parseChefOrderResponse\(raw\)/);
  assert.match(contract, /items\.some\(\(item\) => item === null\)/);
  assert.doesNotMatch(contract, /customerIdentityId|checkoutId|pickupAddress/);
});

test("chef order actions use unique idempotency keys and strict responses", () => {
  const actions = source("../components/chef-order-actions.tsx");
  const acceptRoute = source(
    "../app/api/chef/orders/[orderId]/accept/route.ts",
  );
  const rejectRoute = source(
    "../app/api/chef/orders/[orderId]/reject/route.ts",
  );
  assert.match(actions, /crypto\.randomUUID\(\)/);
  assert.match(actions, /parseChefOrderResponse\(result\)/);
  assert.match(acceptRoute, /"Idempotency-Key": actionId/);
  assert.match(rejectRoute, /"Idempotency-Key": actionId/);
});

test("chef pages render their headers only after the access check", () => {
  for (const page of ["capacity", "meal-plans", "operations", "finance", "statements", "profile", "menu/media", "earnings"]) {
    const contents = source(`../app/chef/${page}/page.tsx`);
    const boundary = contents.indexOf("<ChefAccessBoundary>");
    assert.ok(boundary >= 0 && boundary < contents.indexOf("<ChefPageHeader"), page);
  }
});
