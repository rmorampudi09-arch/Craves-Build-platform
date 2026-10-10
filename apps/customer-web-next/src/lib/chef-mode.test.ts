import assert from "node:assert/strict";
import test from "node:test";
import {
  CHEF_MODE_KEY,
  CHEF_MODE_MAX_AGE_MS,
  clearChefMode,
  isChefModeVerified,
  markChefModeVerified,
  resolveChefDestination,
  safeChefReturnTo,
} from "./chef-mode.ts";

const items = new Map<string, string>();
const sessionStorage = {
  getItem: (key: string) => items.get(key) ?? null,
  setItem: (key: string, value: string) => void items.set(key, value),
  removeItem: (key: string) => void items.delete(key),
};
const owner = "11111111-1111-4111-8111-111111111111";

test("chef mode is verified only for the user who signed in to it in this tab", () => {
  Object.assign(globalThis, { window: { sessionStorage } });
  try {
    items.clear();
    assert.equal(isChefModeVerified(owner), false);
    markChefModeVerified(owner);
    const marker = JSON.parse(items.get(CHEF_MODE_KEY) ?? "null");
    assert.equal(CHEF_MODE_KEY, "craves.chef-mode");
    assert.equal(marker.userId, owner);
    assert.equal(typeof marker.verifiedAt, "number");
    assert.equal(isChefModeVerified(owner), true);
    assert.equal(isChefModeVerified("22222222-2222-4222-8222-222222222222"), false);
    assert.equal(isChefModeVerified(null), false);
    items.set(CHEF_MODE_KEY, "{not json");
    assert.equal(isChefModeVerified(owner), false);
    items.set(CHEF_MODE_KEY, JSON.stringify({ userId: owner }));
    assert.equal(isChefModeVerified(owner), false);
    markChefModeVerified(owner);
    clearChefMode();
    assert.equal(isChefModeVerified(owner), false);
    // A verification older than a working day (or dated in the future) no longer counts.
    items.set(CHEF_MODE_KEY, JSON.stringify({ userId: owner, verifiedAt: Date.now() - CHEF_MODE_MAX_AGE_MS - 1 }));
    assert.equal(isChefModeVerified(owner), false);
    items.set(CHEF_MODE_KEY, JSON.stringify({ userId: owner, verifiedAt: Date.now() + 10 * 60_000 }));
    assert.equal(isChefModeVerified(owner), false);
    items.set(CHEF_MODE_KEY, JSON.stringify({ userId: owner, verifiedAt: Date.now() - 60_000 }));
    assert.equal(isChefModeVerified(owner), true);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("chef mode stays closed and never throws without browser storage", () => {
  markChefModeVerified(owner);
  assert.equal(isChefModeVerified(owner), false);
  clearChefMode();
});

test("approved chefs open their requested chef page, applicants their application", () => {
  const chef = ["CUSTOMER", "chef"];
  assert.equal(resolveChefDestination({ roles: chef, applicationStatus: "APPROVED" }), "/chef");
  assert.equal(resolveChefDestination({ roles: chef, applicationStatus: "APPROVED", returnTo: "/chef/earnings?tab=week" }), "/chef/earnings?tab=week");
  for (const status of ["PENDING", "REJECTED"])
    assert.equal(resolveChefDestination({ roles: ["CUSTOMER"], applicationStatus: status, returnTo: "/chef/earnings" }), "/chef/application/status");
  // Approved but the CHEF role has not reached this session yet: never loop through /chef.
  assert.equal(resolveChefDestination({ roles: ["CUSTOMER"], applicationStatus: "APPROVED", returnTo: "/chef" }), "/chef/application/status");
  for (const status of ["NOT_SUBMITTED", null, undefined])
    assert.equal(resolveChefDestination({ roles: ["CUSTOMER"], applicationStatus: status, returnTo: "/chef/menu" }), "/chef/application");
  // A stale CHEF role does not open the kitchen for a pending application.
  assert.equal(resolveChefDestination({ roles: chef, applicationStatus: "PENDING" }), "/chef/application/status");
});

test("only same-origin chef paths are accepted as a return destination", () => {
  for (const path of ["/chef", "/chef/orders/abc", "/chef/application?step=kitchen", "/chef#top"])
    assert.equal(safeChefReturnTo(path), path);
  for (const path of [
    "https://evil.example/chef",
    "//evil.example/chef",
    "/\\evil.example",
    "/chefs",
    "/home",
    "/chef/sign-in",
    "/chef/sign-in?returnTo=/chef",
    "chef",
    "",
    null,
    ["/chef"],
  ])
    assert.equal(safeChefReturnTo(path), null, String(path));
  assert.equal(resolveChefDestination({ roles: ["CHEF"], applicationStatus: "APPROVED", returnTo: "https://evil.example/chef" }), "/chef");
  assert.equal(resolveChefDestination({ roles: ["CHEF"], applicationStatus: "APPROVED", returnTo: "/home" }), "/chef");
});
