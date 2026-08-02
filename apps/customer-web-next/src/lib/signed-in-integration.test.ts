import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const proxiedMutationRoutes = [
  "../app/api/chef/application/route.ts",
  "../app/api/chef/application/proof-files/route.ts",
  "../app/api/chef/kitchen/route.ts",
  "../app/api/chef/menu/route.ts",
  "../app/api/chef/menu/[menuItemId]/route.ts",
  "../app/api/chef/menu/[menuItemId]/availability/route.ts",
  "../app/api/chef/menu/[menuItemId]/images/route.ts",
  "../app/api/chef/orders/[orderId]/accept/route.ts",
  "../app/api/chef/orders/[orderId]/reject/route.ts",
  "../app/api/chef/orders/[orderId]/ready-for-pickup/route.ts",
  "../app/api/notifications/[noticeId]/read/route.ts",
];

test("all proxied chef mutations use the shared origin guard", () => {
  for (const route of proxiedMutationRoutes) {
    const contents = source(route);
    assert.match(contents, /from "@\/lib\/request-security"/, route);
    assert.match(contents, /isSameOrigin\(request\)/, route);
    assert.doesNotMatch(contents, /function sameOrigin\(/, route);
  }
});

test("authentication asks for customer or chef mode", () => {
  const contents = source("../components/auth/AuthModal.tsx");
  assert.match(contents, /Home Chef/);
  assert.match(contents, /accountMode === "chef"/);
  assert.match(contents, /onAuthenticated\?\.\(user, accountMode\)/);
});

test("signed-in home loads backend address, cart, and discovery without fixed coordinates", () => {
  const contents = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  assert.match(contents, /loadSelectedAddress\(\)/);
  assert.match(contents, /loadCart\(\)/);
  assert.match(
    contents,
    /discoverDishes\(\s*activeAddress\.lat,\s*activeAddress\.lng/s,
  );
  assert.doesNotMatch(contents, /17\.4483|78\.3915/);
});

test("profile exposes backend chef application status", () => {
  const contents = source("../screens/Profile/Profile.tsx");
  assert.match(contents, /fetch\("\/api\/chef\/application"/);
  assert.match(contents, /Chef application pending/);
  assert.match(contents, /Become a home chef/);
});

test("production catalogue does not fall back to demo dishes", () => {
  const contents = source("../services/api/dishes.ts");
  assert.match(
    contents,
    /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true"\s*\?\s*DISHES\s*:\s*\[\]/s,
  );
});

test("empty nearby discovery expands without changing checkout serviceability", () => {
  const dishes = source("../services/api/dishes.ts");
  const policy = source("./catalog-discovery-policy.ts");
  assert.match(dishes, /candidateDiscoveryRadii\(radiusMeters\)/);
  assert.match(dishes, /if \(discoveredDishes\.length > 0\) return discoveredDishes/);
  assert.match(policy, /15_000/);
  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
});

test("real backend chefs remain available in production", () => {
  const contents = source("../services/api/chefs.ts");
  assert.match(contents, /dish\.kitchenId === id/);
  assert.match(contents, /catalogBacked: true/);
  assert.doesNotMatch(
    contents,
    /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK !== "true"\)\s*return undefined/,
  );
});

test("dish and chef detail pages reload discovery after a browser refresh", () => {
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const chef = source("../screens/public/ChefProfile/ChefProfile.tsx");
  for (const contents of [dish, chef]) {
    assert.match(contents, /loadSelectedAddress\(\)/);
    assert.match(contents, /discoverDishes\(address\.lat, address\.lng\)/);
  }
});

test("chef onboarding is reachable and prefills approved backend data", () => {
  const landing = source("../screens/public/LandingPage/LandingPage.tsx");
  const application = source("../components/chef-application-workspace.tsx");
  const kitchen = source("../components/chef-kitchen-form.tsx");
  assert.match(landing, /openAuth\("register", "chef"\)/);
  assert.match(application, /fetch\("\/api\/customer\/profile"/);
  assert.match(application, /fetch\("\/api\/customer\/addresses"/);
  assert.match(kitchen, /application\.status !== "APPROVED"/);
  assert.match(kitchen, /Active kitchens without coordinates cannot appear in discovery/);
});

test("signed-in navigation exposes the implemented backend services", () => {
  const contents = source("../components/home/BrowseHeader.tsx");
  for (const route of [
    "/orders",
    "/subscriptions",
    "/notifications",
    "/chef",
  ]) {
    assert.match(contents, new RegExp(route.replace("/", "\\/")));
  }
});
