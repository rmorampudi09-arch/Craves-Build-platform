import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile customer nav morphs into a View cart pill while browsing down", () => {
  const nav = source("../../customer-shell/components/BottomNav.tsx");

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
  // Tabs and pill trade places as a fade-through (leave 100 ms, arrive after an 80 ms delay),
  // so the two layers are never drawn over each other.
  assert.match(nav, /initial=\{NAV_SWAP\.pillOut\}/);
  assert.match(nav, /pillOut: \{ opacity: 0, transform: "translateX\(16px\)" \}/);
  assert.match(nav, /hide: \{ opacity: 0, transform: "scale\(0\.98\)", transition: \{ duration: 0\.1, ease: ease\.in \} \}/);
  assert.match(nav, /show: \{ opacity: 1, transform: "scale\(1\)", transition: \{ duration: 0\.18, ease: ease\.out, delay: 0\.08 \} \}/);
  assert.doesNotMatch(nav, /left: "/);
  assert.doesNotMatch(nav, /spring\.ui/);
  assert.match(nav, /key=\{itemCount\}/);
  assert.match(nav, /scale: \[1, 1\.18, 1\]/);
  assert.match(nav, /AnimatePresence/);
  assert.doesNotMatch(nav, /hiddenByScroll/);
  assert.doesNotMatch(nav, /#2563EB|ShoppingCart|UserRound/);
});

test("cart checkout stays above mobile chrome and customer nav is absent on cart", () => {
  const nav = source("../../customer-shell/components/BottomNav.tsx");
  const checkout = source("../../cart/components/CartCheckoutBar.tsx");

  assert.match(nav, /const HIDDEN_PATH_PREFIXES = \[[\s\S]*"\/cart"/);
  assert.match(checkout, /bottom-0 z-50/);
});

test("mobile discovery keeps search, veg and cravings accessible while scrolling", () => {
  const header = source("../components/BrowseHeader.tsx");
  const autoHide = source("../../../shared/components/navigation/AutoHideCustomerHeader.tsx");
  const cravings = source("../components/HomeCategoryRail.tsx");

  assert.match(header, /<AutoHideCustomerHeader mobileStatic/);
  assert.match(autoHide, /static md:sticky md:top-0/);
  assert.match(header, /mobileCompact/);
  assert.match(header, /fixed inset-x-0 top-0 z-50/);
  // The big photo rail scrolls away with the page; once it is gone a slim pill row (one 56 px
  // line) sticks below the header. It takes no space in the flow, and is inert and click-through
  // while hidden, so it never stacks a second tall bar over the dishes.
  assert.match(cravings, /"pointer-events-none sticky z-30 -mb-14 h-14"/);
  assert.match(cravings, /inert=\{!stuck\}/);
  assert.match(cravings, /rootMargin: "-80px 0px 0px 0px"/);
  assert.match(cravings, /compact \? "top-\[3\.75rem\]" : "top-0"/);
  assert.match(cravings, /hidden \? "md:top-0" : "md:top-\[4\.25rem\] lg:top-\[4\.65rem\]"/);
  assert.doesNotMatch(cravings, /translate-y-\[var\(--craves-mobile-search-offset/);
  assert.doesNotMatch(cravings, /will-change/);
  // One controller drives header, compact bar, rail and tab bar with the same timing.
  for (const surface of [header, cravings]) assert.match(surface, /useScrollChrome\(\)/);
  assert.doesNotMatch(cravings, /window\.addEventListener\("scroll"/);
  // The header's one scroll listener only tells whether the page is at its top (red or white), never hide or show.
  assert.equal(header.match(/addEventListener\("scroll"/g)?.length, 1);
  assert.match(header, /function useAtPageTop\(enabled: boolean\)/);
  assert.match(autoHide, /COMPACT_AFTER_PX = 76/);
  assert.match(autoHide, /Math\.abs\(delta\) > window\.innerHeight/);
  assert.match(header, /duration-\(--dur-chrome\) ease-\(--ease-standard\)/);
  assert.match(autoHide, /duration-\(--dur-chrome\) ease-\(--ease-standard\)/);
  assert.match(cravings, /duration: duration\.chrome \* 1000/);
  assert.match(cravings, /translate: \[`0 \$\{shift\}px`, "0 0"\]/);
  assert.doesNotMatch(cravings, /md:static/);
});

test("mobile browse keeps dish proportions and cart glass, with the app's category photos", () => {
  const card = source("../components/DishCard.tsx");
  const grid = source("../components/DishesGrid.tsx");
  const cravings = source("../components/HomeCategoryRail.tsx");
  const nav = source("../../customer-shell/components/BottomNav.tsx");
  const homeStyles = source("../screens/HomeReference.module.css");

  assert.match(card, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(card, /aspect-\[4\/3\]/);
  assert.match(grid, /aspect-\[16\/9\] sm:aspect-\[16\/10\]/);
  assert.doesNotMatch(grid, /aspect-\[4\/3\]/);
  // The app's 128 px category photos, shown at the app's 64 px (72 px from md) so they stay sharp.
  assert.match(cravings, /h-16 w-16 [^"]*md:h-\[4\.5rem\] md:w-\[4\.5rem\]/);
  assert.match(cravings, /image: "\/home\/categories\/all\.webp"/);
  // Tabs and the cart bar share one floating glass bar (the desktop cart bar's glass);
  // only View cart is coloured (leaf green, AA).
  assert.match(nav, /\$\{glass\.glassDock\} pointer-events-auto relative isolate/);
  assert.match(nav, /className=\{glass\.floatingCartGlass\}/);
  assert.match(homeStyles, /\.glassDock \{[\s\S]*?backdrop-filter: blur\(8px\) saturate\(145%\)/);
  assert.match(nav, /bg-\[#17803D\][^"]*text-white/);
  assert.doesNotMatch(nav, /bg-\[#1A1A1A\]/);
  // The selected tab is marked by a pill, not by colour alone, and the badge passes AA.
  assert.match(nav, /const TAB_PILL = "bg-white\/85 text-\[#F62E18\]/);
  assert.match(nav, /active \? TAB_PILL : ""/);
  assert.match(nav, /bg-\[#C4200F\][^"]*text-white/);
  // Keyboard users keep the tabs: the bar never makes them inert while navigating by keys.
  assert.match(nav, /const cartExpanded = hidden && itemCount > 0 && !keyboardNavigation;/);
  assert.match(homeStyles, /backdrop-filter: blur\(8px\) saturate\(145%\)/);
  assert.match(homeStyles, /\.floatingCartGlass::before/);
  assert.match(homeStyles, /\.floatingCartGlass::after/);
  assert.doesNotMatch(homeStyles, /blur\(48px\)/);
});

test("profile treats meal subscription as its own destination", () => {
  const profile = source("../../profile/screens/Profile.tsx");

  assert.match(profile, /id="profile-meal-subscription"/);
  assert.match(profile, /title="Meal plans"/);
  assert.match(profile, /Payments, referrals & chef tools/);
  assert.doesNotMatch(profile, /title="Membership"/);
});

test("customer discovery and detail recovery are fail-closed at 10 km", () => {
  const policy = source("./catalog-discovery-policy.ts");
  const home = source("../screens/BrowseFoods.tsx");
  const dish = source("../../dish/screens/FoodDetails.tsx");
  const kitchen = source("../../chefs/screens/ChefProfile.tsx");

  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 10_000/);
  assert.doesNotMatch(policy, /50_000|15_000/);
  assert.match(home, /DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(home, /dishes: allDishes\(\)/);
  assert.match(home, /kitchens: allKitchens\(\)/);
  assert.match(home, /const hasInitialCatalog =/);
  assert.match(home, /const shouldPreserveCatalog =/);
  assert.match(home, /refreshDiscovery\(defaultAddress, false, shouldPreserveCatalog\)/);
  assert.match(dish, /outside the 10 km Craves browsing area/);
  assert.match(kitchen, /outside the 10 km Craves browsing area/);
});

test("review totals are optional and never block dish or kitchen rendering", () => {
  const reviews = source("../../dish/api/reviews.ts");
  const reviewRoute = source(
    "../../../app/api/reviews/kitchens/[kitchenId]/summary/route.ts",
  );
  const dish = source("../../dish/screens/FoodDetails.tsx");
  const kitchen = source("../../chefs/screens/ChefProfile.tsx");

  assert.match(reviews, /response\.status === 204/);
  assert.match(reviewRoute, /status: 204/);
  assert.match(dish, /\.catch\(\(\) =>/);
  assert.match(kitchen, /\.catch\(\(\) =>/);
});

test("category, Veg and sort changes reveal dishes calmly instead of a long chrome-toggling scroll", () => {
  const home = source("../screens/BrowseFoods.tsx");
  const grid = source("../components/DishesGrid.tsx");

  // One helper for every view change; far targets jump, near ones glide, chrome holds still.
  assert.match(home, /const revealDishes = useCallback\(\(onlyIfPast = false\)/);
  assert.match(home, /distance > window\.innerHeight \|\| prefersReducedMotion\(\)[\s\S]{0,60}forceInstantWindowScroll\(target\)/);
  assert.match(home, /holdScrollChrome\(\);\s*if \(distance > window\.innerHeight/);
  assert.match(home, /data-craves-category-rail/);
  // Rail chips are aria-pressed toggles: the selected one turns off on a second tap.
  assert.match(home, /setHomeCategory\(\(current\) => \(current === nextCategory \? null : nextCategory\)\);[\s\S]{0,60}revealDishes\(\);/);
  // Sort, filters and food type change together and move the page once.
  assert.match(home, /setFoodPreference\(next\.foodPreference\);\s*revealDishes\(\);/);
  assert.match(home, /revealDishes\(true\)/);
  assert.doesNotMatch(home, /scrollIntoView/);

  // A new view replaces the list at once (no exit phase, no blank frames) and never shrinks
  // before the scroll lands; heading and count change in the same frame.
  assert.match(grid, /<div\s*key=\{dishViewKey\}/);
  assert.doesNotMatch(grid, /AnimatePresence/);
  // Clearing filters sits beside the count, so turning one on never pushes the list down.
  assert.match(grid, /Clear filters/);
  // The scroll waits for the new list: one layout effect runs the reveal after the deferred render.
  assert.match(home, /const listCategory = useDeferredValue\(homeCategory\)/);
  assert.match(home, /\}, \[listCategory, listSort, listFoodPreference, listDishFilters\]\);/);
  assert.match(grid, /listItem\(index\)/);
  assert.match(grid, /min-h-svh/);
  assert.match(grid, /paging\.key === dishViewKey \? paging\.count : INITIAL_DISH_COUNT/);
  assert.doesNotMatch(grid, /setVisibleCount|scrollIntoView|@radix-ui\/react-popover/);
  // Filter bar (Swiggy / Zomato pattern): Filters with a count, Sort, one-tap chips that show
  // an ✕ while on, and a sheet whose button says how many dishes it will show.
  const bar = source("../components/DishFilterBar.tsx");
  assert.match(grid, /<DishFilterBar view=\{view\} onViewChange=\{onViewChange\} countFor=\{countFor\}/);
  assert.match(bar, /role="group"\s*aria-label="Dish filters"/);
  assert.match(bar, /title="Filter and sort"/);
  assert.match(bar, /aria-pressed=\{on\}/);
  assert.match(bar, /`Show \$\{matches\}/);
  assert.doesNotMatch(bar, /Rating/);
});

test("dish bottom bar confirms an add in place and keeps the action bar mounted", () => {
  const bar = source("../../dish/components/DishBottomBar.tsx");

  assert.match(bar, /data-craves-action-bar/);
  assert.match(bar, /const mode = inCart \? \(justAdded \? "added" : "view"\) : "add"/);
  // One label at a time: the old one leaves before the next fades in.
  assert.match(bar, /<AnimatePresence mode="wait" initial=\{false\}>/);
  assert.match(bar, /\{\.\.\.swap\}/);
  assert.match(bar, /Add<span className="hidden min-\[460px\]:inline"> to cart<\/span>/);
  assert.match(bar, /View cart<span className="hidden min-\[400px\]:inline"> · \{cartTotalLabel\}<\/span>/);
});

test("overlays enter and leave smoothly and hand focus back", () => {
  const home = source("../screens/BrowseFoods.tsx");
  const header = source("../components/BrowseHeader.tsx");
  const search = source("../components/HomeSearchOverlay.tsx");
  const replacement = source("../../cart/components/CartKitchenReplacementDialogHost.tsx");
  const availability = source("../components/CartAddressAvailabilityBanner.tsx");
  const addressEditor = source("../../addresses/components/AddressEditorFlow.tsx");

  // Search: the chunk loads at idle or as the finger lands, opens without a Suspense
  // reveal delay (kept in state, not behind next/dynamic), and the overlay fades out.
  assert.match(home, /onSearchIntent=\{preloadHomeSearchOverlay\}/);
  // A tap or click opens search (anywhere on the pill: the label forwards the click); Tab
  // landing on the field does not (WCAG 3.2.1); typing does. Phone Back closes it.
  assert.match(home, /onSearchActivate=\{openSearchOnTap\}/);
  assert.match(home, /onSearchTermChange=\{typeInSearch\}/);
  assert.match(header, /onClick=\{onSearchActivate\}/);
  assert.doesNotMatch(header, /onFocus=/);
  assert.match(search, /useOverlayHistory\(present, onClose\)/);
  // Only Back onto search's own entry reopens it with the old words.
  assert.match(home, /const backToSearch = restored\.searchOpen && returnedToOverlayEntry\(\)/);
  assert.match(header, /onPointerDown=\{onSearchIntent\}/);
  assert.match(home, /window\.requestIdleCallback\(preloadHomeSearchOverlay/);
  assert.match(home, /<AnimatePresence>\s*\{searchOpen && HomeSearchOverlay \? \(/);
  assert.doesNotMatch(home, /const HomeSearchOverlay = dynamic/);
  assert.match(search, /exit=\{\{ opacity: 0, transition: \{ duration: 0\.15/);

  // Kitchen replacement: bottom sheet on phones, scrim fade, focus in and back, closes on navigation.
  assert.match(replacement, /initial: \{ y: "100%" \}/);
  assert.match(replacement, /duration: duration\.sheetIn, ease: ease\.out/);
  assert.match(replacement, /duration: duration\.sheetOut, ease: ease\.in/);
  assert.match(replacement, /bg-\[#1A1A1A\]\/48/);
  assert.match(replacement, /returnFocusRef\.current\?\.focus/);
  assert.match(replacement, /settle\(false\);\s*\}, \[pathname, settle\]\)/);
  assert.match(replacement, /event\.key === "Escape"/);

  // Cart-vs-address notice: an inline banner at the top of Home, not a pop-up that blocks browsing.
  assert.match(home, /<main>\s*<CartAddressAvailabilityBanner/);
  assert.doesNotMatch(availability, /role="dialog"|aria-modal|fixed inset-0/);
  assert.match(availability, /aria-live="polite"/);
  assert.match(availability, /exit=\{\{ opacity: 0, y: -8/);
  assert.doesNotMatch(availability, /bg-\[#F62E18\]\/10|backdrop-blur/);

  // Address sheet: animates in and out, steps overlap instead of leaving a blank gap.
  assert.doesNotMatch(addressEditor, /if \(!open\) return null/);
  assert.match(addressEditor, /data-\[state=open\]:slide-in-from-bottom data-\[state=open\]:duration-\(--dur-sheet-in\)/);
  assert.match(addressEditor, /data-\[state=closed\]:slide-out-to-bottom data-\[state=closed\]:duration-\(--dur-sheet-out\)/);
  assert.match(addressEditor, /<AnimatePresence mode="popLayout" initial=\{false\}>/);
  assert.match(addressEditor, /overscroll-contain/);
  assert.doesNotMatch(addressEditor, /h-1 w-10 shrink-0 rounded-full bg-\[#D7DADF\]/);
  assert.doesNotMatch(addressEditor, /bg-\[#F62E18\]\/10/);
});

test("the Home header has no chef button; Profile is the one way into chef mode or the chef application", () => {
  const header = source("../components/BrowseHeader.tsx");
  const profile = source("../../profile/screens/Profile.tsx");

  assert.doesNotMatch(header, /to="\/chef|to=\{chefDestination\}|ArrowLeftRight|chef mode|chef application/i);
  // Profile covers every case: chefs switch to chef mode, everyone else becomes a home chef.
  assert.match(profile, /title: "Switch to Chef mode"/);
  assert.match(profile, /title: "Become a home chef"/);
});
