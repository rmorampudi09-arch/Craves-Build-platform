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
  assert.match(contents, /discoverDishes\(activeAddress\.lat, activeAddress\.lng/);
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
    /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK === "true" \? DISHES : \[\]/,
  );
});
