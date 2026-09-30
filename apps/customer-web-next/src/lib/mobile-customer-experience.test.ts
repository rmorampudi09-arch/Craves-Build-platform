import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile customer nav morphs the Cart tab right-to-left while browsing down", () => {
  const nav = source("../components/layout/BottomNav.tsx");

  assert.match(nav, /FaHome/);
  assert.match(nav, /CalendarDays/);
  assert.match(nav, /ChefHat/);
  assert.match(nav, /FaUser/);
  assert.match(nav, /CravesCartIcon/);
  assert.match(nav, /label: "Meal Subscription"/);
  assert.match(nav, /href: "\/chefs"/);
  assert.doesNotMatch(nav, /home#nearby-kitchens-heading/);
  assert.match(nav, /cartExpanded/);
  assert.match(nav, /direction === "down" && travel >= 18/);
  assert.match(nav, /direction === "up" && travel >= 18/);
  assert.match(nav, /left: "79%"/);
  assert.match(nav, /left: "0\.4rem"/);
  assert.match(nav, /AnimatePresence/);
  assert.doesNotMatch(nav, /hiddenByScroll/);
  assert.doesNotMatch(nav, /#2563EB|ShoppingCart|UserRound/);
});

test("cart checkout stays above mobile chrome and customer nav is absent on cart", () => {
  const nav = source("../components/layout/BottomNav.tsx");
  const checkout = source("../components/cart/CartCheckoutBar.tsx");

  assert.match(nav, /const HIDDEN_PATH_PREFIXES = \[[\s\S]*"\/cart"/);
  assert.match(checkout, /bottom-0 z-50/);
});

test("mobile discovery keeps search, veg and cravings accessible while scrolling", () => {
  const header = source("../components/home/BrowseHeader.tsx");
  const autoHide = source("../components/navigation/AutoHideCustomerHeader.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");

  assert.match(header, /<AutoHideCustomerHeader mobileStatic/);
  assert.match(autoHide, /static md:sticky md:top-0/);
  assert.match(header, /mobileCompact/);
  assert.match(header, /fixed inset-x-0 top-0 z-50/);
  assert.match(cravings, /translate-y-\[var\(--craves-mobile-search-offset,0px\)\]/);
  assert.match(cravings, /md:top-\[var\(--craves-desktop-header-offset-md,4\.25rem\)\]/);
  assert.match(cravings, /lg:top-\[var\(--craves-desktop-header-offset-lg,4\.65rem\)\]/);
  assert.match(header, /--craves-mobile-search-offset/);
  assert.match(header, /mobileDirectionAnchorRef/);
  assert.match(header, /direction === "up" && travel >= 20/);
  assert.match(header, /direction === "down" && travel >= 16/);
  assert.match(header, /mobileCompact \? "3\.75rem" : "0px"/);
  assert.match(header, /duration-\[340ms\]/);
  assert.match(cravings, /duration-\[340ms\]/);
  assert.match(autoHide, /--craves-desktop-header-offset-md/);
  assert.match(autoHide, /duration-\[300ms\]/);
  assert.match(cravings, /md:duration-\[300ms\]/);
  assert.match(cravings, /lg:top-\[var\(--craves-desktop-header-offset-lg,4\.65rem\)\]/);
  assert.doesNotMatch(cravings, /md:static/);
});

test("mobile browse proportions and cart glass stay aligned with the compact reference", () => {
  const card = source("../components/home/DishCard.tsx");
  const grid = source("../components/home/DishesGrid.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");
  const nav = source("../components/layout/BottomNav.tsx");
  const homeStyles = source("../screens/public/BrowseFoods/HomeReference.module.css");

  assert.match(card, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(card, /aspect-\[4\/3\]/);
  assert.match(grid, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(grid, /aspect-\[4\/3\]/);
  assert.match(cravings, /h-\[3\.8rem\] w-\[3\.8rem\]/);
  assert.match(nav, /bg-white\/50/);
  assert.match(nav, /backdrop-blur-\[8px\]/);
  assert.match(nav, /backdrop-saturate-\[145%\]/);
  assert.match(homeStyles, /backdrop-filter: blur\(8px\) saturate\(145%\)/);
  assert.doesNotMatch(homeStyles, /blur\(48px\)/);
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
