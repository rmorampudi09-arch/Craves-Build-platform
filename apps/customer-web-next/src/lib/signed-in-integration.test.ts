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

test("signed-in home loads live discovery and opens customer kitchen details without losing home context", () => {
  const contents = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const search = source("../components/home/HomeSearchOverlay.tsx");
  const returnState = source("./home-return-state.ts");
  const signOut = source("../components/home/CustomerSignOutDialog.tsx");
  const kitchensService = source("../services/api/kitchens.ts");

  assert.match(contents, /loadSelectedAddress\(\)/);
  assert.match(contents, /loadCart\(\)/);
  assert.match(
    contents,
    /discoverKitchens\(activeAddress\.lat, activeAddress\.lng, 5_000\)/,
  );
  assert.match(contents, /discoverDishes\(activeAddress\.lat, activeAddress\.lng\)/);
  assert.match(contents, /<HomeCategoryRail/);
  assert.doesNotMatch(contents, /<TodaysSpecial/);
  assert.match(contents, /<KitchensGrid/);
  assert.match(contents, /<DishesGrid/);
  assert.match(contents, /<HomeSearchOverlay/);
  assert.match(contents, /<CustomerSignOutDialog/);
  assert.match(contents, /<CartAddressAvailabilityDialog/);
  assert.match(contents, /nearbyKitchenIds/);
  assert.match(contents, /loadKitchenMenu\(kitchenId\)/);
  assert.match(contents, /unavailableCartItems/);
  assert.match(contents, /rememberHomeView\(\)/);
  assert.match(contents, /to: "\/kitchen\/\$id"/);
  assert.match(contents, /getSession\(\)/);
  assert.match(contents, /getAddress\(\)/);
  assert.match(contents, /allDishes\(\)/);
  assert.match(contents, /allKitchens\(\)/);
  assert.match(contents, /restoreHomeView\(\)/);
  assert.doesNotMatch(contents, /selectedKitchen \?/);
  assert.doesNotMatch(contents, /17\.4483|78\.3915/);

  assert.match(search, /to="\/dish\/\$id"/);
  assert.match(search, /to="\/kitchen\/\$id"/);
  assert.match(search, /fixed inset-0/);
  assert.match(returnState, /window\.sessionStorage/);
  assert.match(returnState, /scrollY/);
  assert.match(returnState, /searchTerm/);
  assert.match(returnState, /homeCategory/);
  assert.match(signOut, /role="dialog"/);
  assert.match(signOut, /Sign out of Craves\?/);
  assert.match(signOut, /Stay signed in/);
  assert.match(kitchensService, /export function allKitchens\(\)/);
});

test("profile exposes backend chef application status", () => {
  const contents = source("../screens/Profile/Profile.tsx");
  assert.match(contents, /fetch\("\/api\/chef\/application"/);
  assert.match(contents, /Chef application pending/);
  assert.match(contents, /Become a home chef/);
});

test("production catalogue has no demo dish fallback", () => {
  const contents = source("../services/api/dishes.ts");
  assert.doesNotMatch(contents, /export const DISHES/);
  assert.doesNotMatch(contents, /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
  assert.match(contents, /parseMenuDiscovery\(body\)/);
  assert.match(contents, /\/api\/discovery\/menu-items/);
});

test("empty nearby discovery expands without changing checkout serviceability", () => {
  const dishes = source("../services/api/dishes.ts");
  const policy = source("./catalog-discovery-policy.ts");
  assert.match(dishes, /candidateDiscoveryRadii\(radiusMeters\)/);
  assert.match(
    dishes,
    /if \(discoveredDishes\.length > 0\) return \[\.\.\.discoveredDishes\]/,
  );
  assert.match(policy, /15_000/);
  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
});

test("real backend chefs remain available in production", () => {
  const contents = source("../services/api/chefs.ts");
  assert.match(contents, /dish\.kitchenId === id/);
  assert.match(contents, /catalogBacked: true/);
  assert.doesNotMatch(contents, /reviewPool|LOCATIONS|NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
});

test("dish and customer kitchen detail pages recover live data and return to saved home context", () => {
  const dishPage = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const dishService = source("../services/api/dishes.ts");
  const kitchenPage = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const customerKitchenRoute = source("../app/kitchen/[id]/page.tsx");
  const legacyChefRoute = source("../app/chef/[id]/page.tsx");

  assert.match(dishPage, /loadDish\(id\)/);
  assert.match(dishPage, /const cachedDish = getDish\(id\)/);
  assert.match(dishPage, /hasHomeReturnState\(\)/);
  assert.match(dishPage, /window\.history\.back\(\)/);
  assert.match(dishService, /\/api\/catalog\/menu-items/);
  assert.match(dishService, /const loadedIds = new Set/);
  assert.match(kitchenPage, /getRouteApi\("\/kitchen\/\$id"\)/);
  assert.match(kitchenPage, /loadSelectedAddress\(\)/);
  assert.match(kitchenPage, /discoverDishes\(address\.lat, address\.lng\)/);
  assert.match(kitchenPage, /hasHomeReturnState\(\)/);
  assert.match(kitchenPage, /window\.history\.back\(\)/);
  assert.match(customerKitchenRoute, /ChefProfilePage/);
  assert.doesNotMatch(customerKitchenRoute, /ChefAccessBoundary|ChefWorkspaceNavigation/);
  assert.match(legacyChefRoute, /redirect\(`\/kitchen\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test("home kitchen and dish details share one live floating cart without forcing checkout", () => {
  const sharedCart = source("../components/cart/CustomerFloatingCart.tsx");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");

  assert.match(sharedCart, /subscribeCart/);
  assert.match(sharedCart, /cartCount\(\)/);
  assert.match(sharedCart, /cartTotal\(\)/);
  assert.match(sharedCart, /cartCurrency\(\)/);

  for (const surface of [home, kitchen, dish]) {
    assert.match(surface, /<CustomerFloatingCart \/>/);
  }

  assert.match(kitchen, /useCustomerCartSummary\(\)/);
  assert.match(dish, /useCustomerCartSummary\(\)/);
  assert.match(dish, /cartSummary\.itemCount === 0 \? \(/);
  assert.match(dish, /messageKind === "success"/);
  assert.match(dish, /was added to your cart/);
  assert.doesNotMatch(dish, /navigate\(\{ to: "\/cart" \}\);/);
});

test("every home-chef call to action opens the live chef registration flow", () => {
  const landing = source("../screens/public/LandingPage/LandingPage.tsx");
  const hero = source("../components/sections/HeroSection.tsx");
  const application = source("../components/chef-application-workspace.tsx");
  const kitchen = source("../components/chef-kitchen-form.tsx");

  assert.match(
    landing,
    /onBecomeChef=\{\(\) => openAuth\("register", "chef", true\)\}/,
  );
  assert.match(hero, /onClick=\{onBecomeChef\}/);
  assert.match(
    landing,
    /hasChefRole\(authenticatedUser\)\s*\?\s*"\/chef"\s*:\s*"\/chef\/application"/s,
  );
  assert.match(application, /fetch\("\/api\/customer\/profile"/);
  assert.match(application, /fetch\("\/api\/customer\/addresses"/);
  assert.match(kitchen, /application\.status !== "APPROVED"/);
  assert.match(
    kitchen,
    /Use current location before activating this kitchen/,
  );
});

test("pending chef applications remain editable exactly as the backend permits", () => {
  const contents = source("../components/chef-application-workspace.tsx");
  assert.match(contents, /const locked = application\?\.status === "APPROVED"/);
  assert.match(contents, /onSubmit=\{submit\}/);
  assert.match(contents, /Update pending application/);
  assert.doesNotMatch(
    contents,
    /application\?\.status === "PENDING" \|\| application\?\.status === "APPROVED"/,
  );
});

test("chef dashboard reuses the working Craves session for applicants and chefs", () => {
  const dashboard = source("../components/chef-mode-dashboard.tsx");
  const phoneAuth = source("../components/phone-auth-form.tsx");
  assert.match(dashboard, /loadSession\(\)/);
  assert.match(dashboard, /state === "applicant"/);
  assert.match(dashboard, /Open chef application/);
  assert.doesNotMatch(dashboard, /fetch\("\/api\/chef\/me"/);
  assert.match(phoneAuth, /Secure Craves access/);
  assert.doesNotMatch(phoneAuth, /Secure customer access/);
});

test("chef identity BFF unwraps the Spring Auth Service response", () => {
  const contents = source("../app/api/chef/me/route.ts");
  assert.match(contents, /parseChefModeIdentity\(raw\?\.identity\)/);
  assert.doesNotMatch(contents, /parseChefModeIdentity\(await upstream\.json/);
});

test("protected chef pages synchronize the JWT after admin grants CHEF", () => {
  const auth = source("../services/auth/cravesAuth.ts");
  const boundary = source("../components/chef-access-boundary.tsx");
  assert.match(auth, /synchronizeSessionRoles/);
  assert.match(auth, /fetch\("\/api\/auth\/refresh"/);
  assert.match(boundary, /loadSession\(\)/);
  assert.match(boundary, /synchronizeSessionRoles\(\)/);
  assert.match(boundary, /setState\("not-approved"\)/);

  for (const page of [
    "../app/chef/kitchen/page.tsx",
    "../app/chef/menu/page.tsx",
    "../app/chef/menu/media/page.tsx",
    "../app/chef/orders/page.tsx",
    "../app/chef/orders/[orderId]/page.tsx",
  ]) {
    assert.match(source(page), /ChefAccessBoundary/, page);
  }
});

test("customer headers stay lean and share the same responsive scroll behavior", () => {
  const autoHide = source(
    "../components/navigation/AutoHideCustomerHeader.tsx",
  );
  const homeHeader = source("../components/home/BrowseHeader.tsx");
  const detailHeader = source("../components/navigation/DetailBrowseHeader.tsx");
  const cartHeader = source("../components/cart/CartHeader.tsx");
  const checkoutHeader = source("../components/checkout/CheckoutHeader.tsx");
  const profileHeader = source("../components/profile/ProfileHeader.tsx");
  const trackingHeader = source("../components/tracking/TrackingHeader.tsx");
  const orders = source("../screens/OrderHistory/OrderHistory.tsx");
  const saved = source("../screens/Wishlist/Wishlist.tsx");
  const notifications = source("../screens/Notifications/Notifications.tsx");
  const addresses = source("../screens/Profile/Addresses.tsx");

  assert.doesNotMatch(homeHeader, /PersistentCustomerServiceNav/);
  assert.doesNotMatch(detailHeader, /forceServiceNav/);

  for (const surface of [
    homeHeader,
    cartHeader,
    checkoutHeader,
    profileHeader,
    trackingHeader,
    orders,
    saved,
    notifications,
    addresses,
  ]) {
    assert.match(surface, /AutoHideCustomerHeader/);
  }

  assert.match(autoHide, /TOP_REVEAL_PX = 24/);
  assert.match(autoHide, /HIDE_AFTER_PX = 96/);
  assert.match(autoHide, /delta > HIDE_DELTA_PX/);
  assert.match(autoHide, /delta < -SHOW_DELTA_PX/);
  assert.match(autoHide, /requestAnimationFrame/);
  assert.match(autoHide, /duration-\[240ms\]/);
  assert.match(autoHide, /motion-reduce:transition-none/);
  assert.match(autoHide, /onFocusCapture=\{\(\) => setHidden\(false\)\}/);
});