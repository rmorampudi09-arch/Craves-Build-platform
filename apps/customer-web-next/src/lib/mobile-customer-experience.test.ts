import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile customer nav morphs into a View cart pill while browsing down", () => {
  const nav = source("../components/layout/BottomNav.tsx");

  assert.match(nav, /FaHome/);
  assert.match(nav, /CalendarDays/);
  assert.match(nav, /ChefHat/);
  assert.match(nav, /FaUser/);
  assert.match(nav, /CravesCartIcon/);
  assert.match(nav, /label: "Meal plans"/);
  assert.match(nav, /href: "\/chefs"/);
  assert.doesNotMatch(nav, /home#nearby-kitchens-heading/);
  assert.match(nav, /cartExpanded/);
  // Driven by the shared chrome controller, not its own scroll listener.
  assert.match(nav, /useScrollChrome\(\)/);
  assert.match(nav, /const cartExpanded = hidden && itemCount > 0/);
  assert.doesNotMatch(nav, /addEventListener\("scroll"/);
  // Transform and opacity only: the pill slides in on x, never animates left/width.
  assert.match(nav, /initial=\{\{ opacity: 0, x: 24, scale: 0\.96 \}\}/);
  assert.doesNotMatch(nav, /left: "/);
  assert.match(nav, /transition=\{spring\.ui\}/);
  assert.match(nav, /key=\{itemCount\}/);
  assert.match(nav, /scale: \[1, 1\.18, 1\]/);
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
  // The rail sticks below the compact bar via its sticky top (never slides over content).
  assert.match(cravings, /compact \? "top-\[3\.75rem\]" : "top-0"/);
  assert.match(cravings, /hidden \? "md:top-0" : "md:top-\[4\.25rem\] lg:top-\[4\.65rem\]"/);
  assert.doesNotMatch(cravings, /translate-y-\[var\(--craves-mobile-search-offset/);
  assert.doesNotMatch(cravings, /will-change/);
  // One controller drives header, compact bar, rail and tab bar with the same timing.
  for (const surface of [header, cravings]) {
    assert.match(surface, /useScrollChrome\(\)/);
    assert.doesNotMatch(surface, /window\.addEventListener\("scroll"/);
  }
  assert.match(autoHide, /COMPACT_AFTER_PX = 76/);
  assert.match(autoHide, /Math\.abs\(delta\) > window\.innerHeight/);
  assert.match(header, /duration-\(--dur-chrome\) ease-\(--ease-standard\)/);
  assert.match(autoHide, /duration-\(--dur-chrome\) ease-\(--ease-standard\)/);
  assert.match(cravings, /duration: duration\.chrome \* 1000/);
  assert.match(cravings, /translate: \[`0 \$\{shift\}px`, "0 0"\]/);
  assert.doesNotMatch(cravings, /md:static/);
});

test("mobile browse keeps dish proportions and cart glass with larger craving images", () => {
  const card = source("../components/home/DishCard.tsx");
  const grid = source("../components/home/DishesGrid.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");
  const nav = source("../components/layout/BottomNav.tsx");
  const homeStyles = source("../screens/public/BrowseFoods/HomeReference.module.css");

  assert.match(card, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(card, /aspect-\[4\/3\]/);
  assert.match(grid, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(grid, /aspect-\[4\/3\]/);
  assert.match(cravings, /h-\[5\.75rem\] w-\[5\.75rem\]/);
  // Near-opaque chrome is solid: no backdrop blur on the tab bar or its cart pill.
  assert.match(nav, /bg-\[#1A1A1A\]/);
  assert.doesNotMatch(nav, /backdrop-blur/);
  assert.match(homeStyles, /backdrop-filter: blur\(8px\) saturate\(145%\)/);
  assert.match(homeStyles, /\.floatingCartGlass::before/);
  assert.match(homeStyles, /\.floatingCartGlass::after/);
  assert.doesNotMatch(homeStyles, /blur\(48px\)/);
});

test("profile treats meal subscription as its own destination", () => {
  const profile = source("../screens/Profile/Profile.tsx");

  assert.match(profile, /id="profile-meal-subscription"/);
  assert.match(profile, /title="Meal plans"/);
  assert.match(profile, /Payments, referrals & chef tools/);
  assert.doesNotMatch(profile, /title="Membership"/);
});

test("customer discovery and detail recovery are fail-closed at 50 km", () => {
  const policy = source("./catalog-discovery-policy.ts");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");

  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.doesNotMatch(policy, /10_000|15_000/);
  assert.match(home, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(home, /dishes: allDishes\(\)/);
  assert.match(home, /kitchens: allKitchens\(\)/);
  assert.match(home, /const hasInitialCatalog =/);
  assert.match(home, /const shouldPreserveCatalog =/);
  assert.match(home, /refreshDiscovery\(defaultAddress, false, shouldPreserveCatalog\)/);
  assert.match(dish, /outside the 50 km Craves browsing area/);
  assert.match(kitchen, /outside the 50 km Craves browsing area/);
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
