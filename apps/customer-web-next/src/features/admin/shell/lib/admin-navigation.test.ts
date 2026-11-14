import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_MODULES, adminMetricCsv, currentAdminHref, formatAdminTimestamp, isAdminDestination, matchesAdminRoute, searchAdminModules } from "./admin-navigation.ts";

test("every workspace has a unique stable destination", () => {
  assert.equal(ADMIN_MODULES.length, 32);
  assert.equal(new Set(ADMIN_MODULES.map(module => module.id)).size, ADMIN_MODULES.length);
  assert.equal(new Set(ADMIN_MODULES.map(module => module.href)).size, ADMIN_MODULES.length);
  for (const id of ["chefs", "chef-onboarding", "accounts", "finance", "plans", "subscriptions", "capacity", "notifications", "academy", "delivery", "delivery-exceptions", "dead-letters", "operations", "search", "support", "home-banners", "customer-reviews", "account-deletions", "riders", "fleet-selfies", "fleet-trips", "fleet-banner", "fleet-setup", "fleet-health", "fleet-support", "fleet-payouts"]) assert.ok(ADMIN_MODULES.find(module => module.id === id));
});

test("active routes use path boundaries, not shared prefixes", () => {
  assert.ok(matchesAdminRoute("/admin", "/admin"));
  assert.equal(matchesAdminRoute("/admin/search", "/admin"), false);
  assert.ok(matchesAdminRoute("/admin/finance/policies", "/admin/finance"));
  assert.equal(matchesAdminRoute("/admin/subscription-plans", "/admin/subscriptions"), false);
  assert.equal(matchesAdminRoute("/admin/finance-old", "/admin/finance"), false);
  // One module is current: the deepest match.
  assert.equal(currentAdminHref("/admin/riders/selfies"), "/admin/riders/selfies");
  assert.equal(currentAdminHref("/admin/riders/2b6f1c34-0a1e-4c55-9d3a-5f2f4b1d9e10"), "/admin/riders");
  assert.equal(currentAdminHref("/admin"), "/admin");
  assert.equal(currentAdminHref("/admin/no-such-page"), undefined);
});

test("riders and fleet read in the order ops works", () => {
  const riders = ADMIN_MODULES.filter(module => module.group === "Riders & fleet").map(module => module.id);
  assert.deepEqual(riders, ["riders", "fleet-selfies", "fleet-support", "fleet-trips", "fleet-payouts", "fleet-banner", "fleet-setup", "fleet-health"]);
});

test("module search covers work language without pretending to search customer data", () => {
  assert.ok(searchAdminModules("  PAYOUT  ").some(module => module.id === "finance"));
  assert.ok(searchAdminModules("chef onboarding").some(module => module.id === "chefs"));
  assert.ok(searchAdminModules("courier").some(module => module.id === "delivery"));
  assert.ok(searchAdminModules("stuck rider").some(module => module.id === "delivery-exceptions"));
  assert.ok(searchAdminModules("failed webhook").some(module => module.id === "dead-letters"));
  assert.ok(searchAdminModules("rate card").some(module => module.id === "fleet-setup"));
  assert.ok(searchAdminModules("sos").some(module => module.id === "fleet-support"));
  assert.ok(searchAdminModules("erase account").some(module => module.id === "account-deletions"));
  assert.equal(searchAdminModules("no-such-control-12947").length, 0);
  assert.equal(searchAdminModules("").length, ADMIN_MODULES.length);
});

test("standalone delivery application uses its canonical mount", () => {
  const external = ADMIN_MODULES.filter(module => module.externalApp);
  assert.equal(external.length, 1);
  assert.equal(external[0].href, "https://admin.craves.in/delivery-intelligence");
  assert.match(external[0].access, /Read-only/);
});

test("admin sign-in targets reject external and lookalike paths", () => {
  for (const value of ["/admin", "/admin/finance", "/admin/search?type=order", "/delivery-intelligence", "/delivery-intelligence/history"]) assert.ok(isAdminDestination(value), value);
  for (const value of [undefined, 4, "https://evil.test", "//evil.test", "/administrator", "/admin-old", "/admin\\evil", "/admin\n", "/", "/chef", "/delivery-intelligence-old", "/admin?" + "a".repeat(501)]) assert.equal(isAdminDestination(value), false, String(value));
});

test("timestamps explicitly use IST including date rollover", () => {
  assert.match(formatAdminTimestamp("2026-09-14T20:00:00Z"), /15 Sept? 2026/);
  assert.match(formatAdminTimestamp("2026-09-14T20:00:00Z"), /IST$/);
  assert.equal(formatAdminTimestamp("invalid"), "Not available");
});

test("metric export retains exact integer counts and UTC evidence", () => {
  const csv = adminMetricCsv({ ordersCreated24h: 12, refundFailed: 0 }, "2026-09-14T12:00:00Z");
  assert.match(csv, /"ordersCreated24h",12,"2026-09-14T12:00:00.000Z"/);
  assert.match(csv, /"refundFailed",0,/);
  assert.equal(csv.split("\r\n").length, 3);
});

test("exports reject formula-like names and non-count values", () => {
  const csv = adminMetricCsv({ "=HYPERLINK()": 3, "@SUM": 3, valid: 1, negative: -1, fractional: 0.5, unsafe: Number.MAX_SAFE_INTEGER + 1 }, "2026-09-14T12:00:00Z");
  assert.equal(csv.split("\r\n").length, 2);
  assert.match(csv, /"valid",1,/);
  assert.doesNotMatch(csv, /HYPERLINK|@SUM|negative|fractional|unsafe/);
});

test("the owners' menu: every old tool has exactly one new place, and every tab is a real, unique page", async () => {
  const { ADMIN_AREAS, ADMIN_TABS, newAdminPlace } = await import("./admin-navigation.ts");
  assert.equal(ADMIN_AREAS.length, 9);
  assert.equal(new Set(ADMIN_TABS.map(tab => tab.href)).size, ADMIN_TABS.length);
  for (const tab of ADMIN_TABS) assert.ok(ADMIN_AREAS.some(area => area.id === tab.area), tab.label);
  for (const area of ADMIN_AREAS) assert.ok(ADMIN_TABS.some(tab => tab.href === area.href && tab.area === area.id), `${area.label} opens one of its own tabs`);
  for (const tool of ADMIN_MODULES.filter(item => !item.externalApp)) {
    assert.equal(ADMIN_TABS.filter(tab => tab.module === tool.id).length, 1, tool.label);
    assert.equal(newAdminPlace(tool).href, ADMIN_TABS.find(tab => tab.module === tool.id)?.href);
  }
  assert.match(newAdminPlace(ADMIN_MODULES.find(item => item.externalApp)!).label, /^Reports › Delivery Intelligence/);
});

test("a page knows its tab, including ?tab= and ?section= pages and detail pages", async () => {
  const { currentAdminTab } = await import("./admin-navigation.ts");
  assert.equal(currentAdminTab("/admin")?.tab.label, "Today");
  assert.equal(currentAdminTab("/admin/fleet-setup")?.tab.label, "Live, practice & rain");
  assert.equal(currentAdminTab("/admin/fleet-setup", new URLSearchParams("section=trial"))?.tab.label, "Trial setup");
  assert.equal(currentAdminTab("/admin/finance", new URLSearchParams("tab=payouts&q=x"))?.tab.label, "Kitchen payouts");
  assert.equal(currentAdminTab("/admin/finance", new URLSearchParams("from=2026-11-01&to=2026-11-14"))?.tab.label, "Overview");
  assert.equal(currentAdminTab("/admin/riders/selfies")?.tab.label, "Selfies to check");
  assert.deepEqual(currentAdminTab("/admin/riders/2b6f1c34-0a1e-4c55-9d3a-5f2f4b1d9e10")?.detail, true);
  assert.equal(currentAdminTab("/admin/riders/2b6f1c34-0a1e-4c55-9d3a-5f2f4b1d9e10")?.tab.label, "Riders");
  assert.equal(currentAdminTab("/admin/support/2b6f1c34-0a1e-4c55-9d3a-5f2f4b1d9e10")?.tab.area, "inbox");
  assert.equal(currentAdminTab("/admin/explorer/orders")?.tab.area, "orders");
  assert.equal(currentAdminTab("/admin/no-such-page"), undefined);
});

test("old names lead to the new places, in search and on the page", async () => {
  const { ADMIN_TABS, oldAdminName, searchAdminPages, adminOrderReference } = await import("./admin-navigation.ts");
  const tab = (label: string) => ADMIN_TABS.find(item => item.label === label)!;
  assert.equal(oldAdminName(tab("Missed delivery & payment updates")), "Dead letters");
  assert.equal(oldAdminName(tab("All users")), null);
  assert.equal(oldAdminName(tab("Riders")), null);
  assert.equal(searchAdminPages("dead letters")[0]?.href, "/admin/dead-letters");
  assert.ok(searchAdminPages("finance control center").some(hit => hit.href === "/admin/finance"));
  assert.ok(searchAdminPages("delivery intelligence").some(hit => hit.external));
  assert.ok(searchAdminPages("account security").some(hit => hit.href === "/admin/accounts"));
  assert.equal(searchAdminPages("no-such-control-12947").length, 0);
  assert.deepEqual(adminOrderReference("#7f3c21a9"), { kind: "short", value: "7F3C21A9" });
  assert.deepEqual(adminOrderReference("7F3C21A9-0000-4000-8000-000000000001"), { kind: "full", value: "7f3c21a9-0000-4000-8000-000000000001" });
  assert.equal(adminOrderReference("deadbeef"), null);
  assert.deepEqual(adminOrderReference("7f3c"), { kind: "short", value: "7F3C" });
  assert.equal(adminOrderReference("7f3"), null);
  assert.equal(adminOrderReference("refund"), null);
});
