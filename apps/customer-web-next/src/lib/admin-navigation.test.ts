import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_MODULES, adminMetricCsv, formatAdminTimestamp, isAdminDestination, matchesAdminRoute, searchAdminModules } from "./admin-navigation.ts";

test("every workspace has a unique stable destination", () => {
  assert.equal(ADMIN_MODULES.length, 13);
  assert.equal(new Set(ADMIN_MODULES.map(module => module.id)).size, ADMIN_MODULES.length);
  assert.equal(new Set(ADMIN_MODULES.map(module => module.href)).size, ADMIN_MODULES.length);
  for (const id of ["chefs", "accounts", "finance", "plans", "subscriptions", "capacity", "notifications", "academy", "delivery", "operations", "search"]) assert.ok(ADMIN_MODULES.find(module => module.id === id));
});

test("active routes use path boundaries, not shared prefixes", () => {
  assert.ok(matchesAdminRoute("/admin", "/admin"));
  assert.equal(matchesAdminRoute("/admin/search", "/admin"), false);
  assert.ok(matchesAdminRoute("/admin/finance/policies", "/admin/finance"));
  assert.equal(matchesAdminRoute("/admin/subscription-plans", "/admin/subscriptions"), false);
  assert.equal(matchesAdminRoute("/admin/finance-old", "/admin/finance"), false);
});

test("module search covers work language without pretending to search customer data", () => {
  assert.ok(searchAdminModules("  PAYOUT  ").some(module => module.id === "finance"));
  assert.ok(searchAdminModules("chef onboarding").some(module => module.id === "chefs"));
  assert.ok(searchAdminModules("courier").some(module => module.id === "delivery"));
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
