import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile customer nav uses website icons and the cart morphs as frosted glass", () => {
  const nav = source("../components/layout/BottomNav.tsx");

  assert.match(nav, /FaHome/);
  assert.match(nav, /CalendarDays/);
  assert.match(nav, /GiChefToque/);
  assert.match(nav, /FaUser/);
  assert.match(nav, /CravesCartIcon/);
  assert.match(nav, /label: "Meal Subscription"/);
  assert.match(nav, /calc\(100% - 0\.75rem\)/);
  assert.match(nav, /backdrop-blur-\[8px\]/);
  assert.match(nav, /rgba\(255,255,255,0\.45\)/);
  assert.doesNotMatch(nav, /#2563EB|ShoppingCart|UserRound/);
});

test("cart checkout stays above mobile chrome and customer nav is absent on cart", () => {
  const nav = source("../components/layout/BottomNav.tsx");
  const checkout = source("../components/cart/CartCheckoutBar.tsx");

  assert.match(nav, /const HIDDEN_PATH_PREFIXES = \[[\s\S]*"\/cart"/);
  assert.match(checkout, /bottom-0 z-50/);
});

test("only the craving rail remains sticky on mobile home", () => {
  const header = source("../components/home/BrowseHeader.tsx");
  const autoHide = source("../components/navigation/AutoHideCustomerHeader.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");

  assert.match(header, /<AutoHideCustomerHeader mobileStatic/);
  assert.match(autoHide, /static md:sticky md:top-0/);
  assert.match(cravings, /sticky top-0 z-30/);
  assert.match(cravings, /md:static/);
});

test("profile treats meal subscription as its own destination", () => {
  const profile = source("../screens/Profile/Profile.tsx");

  assert.match(profile, /id="profile-meal-subscription"/);
  assert.match(profile, /title="Meal Subscription"/);
  assert.match(profile, /Payments, referrals & chef tools/);
  assert.doesNotMatch(profile, /title="Membership"/);
});

test("customer discovery and detail recovery are fail-closed at 10 km", () => {
  const policy = source("./catalog-discovery-policy.ts");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");

  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 10_000/);
  assert.doesNotMatch(policy, /15_000|50_000/);
  assert.match(home, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(home, /dishes: \[\] as Dish\[\]/);
  assert.match(home, /kitchens: \[\] as NearbyKitchen\[\]/);
  assert.match(home, /refreshDiscovery\(defaultAddress, false, false\)/);
  assert.doesNotMatch(home, /canPreserveInitialCatalog/);
  assert.match(dish, /outside the 10 km Craves browsing area/);
  assert.match(kitchen, /outside the 10 km Craves browsing area/);
});

test("review totals are optional and never block dish or kitchen rendering", () => {
  const reviews = source("../services/api/reviews.ts");
  const reviewRoute = source(
    "../app/api/reviews/kitchens/[kitchenId]/summary/route.ts",
  );
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");

  assert.match(reviews, /response\.status === 204/);
  assert.match(reviewRoute, /status: 204/);
  assert.match(dish, /\.catch\(\(\) =>/);
  assert.match(kitchen, /\.catch\(\(\) =>/);
});
