import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("home uses a real banner, customer skeletons, sticky cravings and image-led chef cards", () => {
  const banner = source("../features/home/components/WelcomeBanner.tsx");
  const home = source("../features/home/screens/BrowseFoods.tsx");
  const chefs = source("../features/chefs/screens/AllChefs.tsx");
  const kitchens = source("../features/home/components/KitchensGrid.tsx");
  const cravings = source("../features/home/components/HomeCategoryRail.tsx");
  const dishes = source("../features/home/components/DishesGrid.tsx");
  const progressiveImage = source("../shared/components/media/ProgressiveImage.tsx");
  const cartItemList = source("../features/cart/components/CartItemList.tsx");
  const cartItemRow = source("../features/cart/components/CartItemRow.tsx");
  const wishlist = source("../features/favorites/screens/Wishlist.tsx");
  const dishHeader = source("../features/dish/components/DishImageHeader.tsx");
  const similarDishes = source("../features/dish/components/SimilarDishesSection.tsx");
  const header = source("../features/home/components/BrowseHeader.tsx");
  const skeleton = source("../shared/components/loading/CustomerPageSkeleton.tsx");

  assert.match(banner, /\/home\/cravings\/craves-home-banner\.webp/);
  assert.match(banner, /unoptimized/);
  assert.match(home, /CustomerPageSkeleton/);
  assert.match(home, /loadMoreDiscoveredDishes/);
  assert.match(home, /hasMoreDiscoveredDishes/);
  assert.match(home, /dishImagesByKitchen=\{kitchenDishImages\}/);
  assert.match(chefs, /CustomerPageSkeleton/);
  assert.match(chefs, /discoverDishes\(/);
  assert.match(chefs, /dishImagesByKitchen=\{dishImagesByKitchen\}/);
  assert.match(kitchens, /KitchenDishPreview/);
  // Kitchen photos slide on by themselves (the next one follows from the right) only with a
  // Pause photos control (WCAG 2.2.2), never for reduced motion, only while the card is on
  // screen, held on hover or focus; a swipe hands the card to the customer.
  assert.match(kitchens, /Pause photos/);
  assert.match(kitchens, /useReducedMotion\(\)/);
  assert.match(kitchens, /intersectionRatio >= 0\.6/);
  assert.match(kitchens, /:hover, :focus-within/);
  assert.match(kitchens, /if \(!moving\.current\) setSwiped\(true\)/);
  assert.match(kitchens, /behavior: "smooth"/);
  // Home shows a few kitchens and links to all of them with the count.
  assert.match(kitchens, /See all \{kitchens\.length\} home chefs/);
  assert.match(home, /limit=\{6\}/);
  assert.doesNotMatch(kitchens, /ChevronLeft/);
  assert.doesNotMatch(kitchens, /ChevronRight/);
  assert.doesNotMatch(kitchens, /kitchenPreviewTrack/);
  assert.doesNotMatch(kitchens, /\b3000\b/);
  // A native snap strip follows the finger; dots track the scroll with opacity/scale only.
  assert.match(kitchens, /snap-x snap-mandatory overflow-x-auto/);
  assert.doesNotMatch(kitchens, /onPointerDown|setPointerCapture|duration-500/);
  assert.match(kitchens, /new window\.Image\(\)/);
  assert.match(kitchens, /kitchenImagePreloads/);
  assert.match(kitchens, /priority=\{index < 4\}/);
  assert.match(kitchens, /fetchPriority=\{priority && index === 0 \? "high" : "auto"\}/);
  assert.match(kitchens, /transition-\[opacity,scale\]/);
  assert.doesNotMatch(kitchens, /transition-all|w-4 bg-white/);
  assert.doesNotMatch(kitchens, /View chef/);
  assert.match(dishes, /priorityImage=\{index < 4\}/);
  assert.match(progressiveImage, /unoptimized = true/);
  assert.match(cartItemList, /priorityImage=\{index < 4\}/);
  assert.match(cartItemRow, /fetchPriority=\{priorityImage \? "high" : "auto"\}/);
  assert.match(wishlist, /eager=\{index < 4\}/);
  assert.match(source("../features/favorites/components/SavedDishCard.tsx"), /fetchPriority=\{eager \? "high" : "auto"\}/);
  assert.match(dishHeader, /fetchPriority=\{index === safeIndex \? "high" : "low"\}/);
  assert.match(similarDishes, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(cravings, /compact \? "top-\[3\.75rem\]" : "top-0"/);
  assert.match(cravings, /fetchPriority=\{priorityImage \? "high" : "auto"\}/);
  assert.match(cravings, /md:top-\[4\.25rem\] lg:top-\[4\.65rem\]/);
  assert.match(cravings, /shadow-\[0_3px_10px_rgba\(26,26,26,0\.09\)\]/);
  assert.doesNotMatch(cravings, /md:static/);
  // Chips: a real press state, scroll arrows only for pointers, selection without a tint.
  assert.match(cravings, /group-active:scale-\[0\.96\]/);
  assert.match(cravings, /duration-\(--dur-component\)/);
  assert.match(cravings, /ring-2 ring-\[#F62E18\] ring-offset-2/);
  assert.match(cravings, /md:left-4 md:top-\[3\.75rem\] md:flex/);
  assert.doesNotMatch(cravings, /rgba\(246,46,24,0\.12\)|backdrop-blur/);
  // No chef shortcut in the Home header: Profile is the way into chef mode.
  assert.doesNotMatch(header, /to="\/chef/);
  assert.match(header, /focus-within:bg-white/);
  assert.match(header, /mobileCompact/);
  assert.match(header, /<CravesLogo size="md" \/>/);
  assert.doesNotMatch(header, /Food From Home/);
  assert.match(header, /fixed inset-x-0 top-0 z-50/);
  assert.match(skeleton, /CustomerPageSkeleton\.module\.css/);
  assert.match(skeleton, /SkeletonBlock/);
  assert.doesNotMatch(skeleton, /animate-pulse/);
});

test("profile edit stays focused on name, phone and optional OTP email verification", () => {
  const edit = source("../features/profile/components/EditProfileModal.tsx");
  const email = source("../features/sign-in/components/EmailVerificationPanel.tsx");
  const account = source("../features/profile/components/AccountCard.tsx");

  assert.match(edit, /Phone number/);
  assert.match(edit, /readOnly/);
  // The shared Sheet owns scroll lock, focus trap and Back-to-close.
  assert.match(edit, /<Sheet/);
  assert.match(edit, /closeOnOutsideTap=\{!typed\}/);
  assert.match(edit, /overscroll-contain/);
  assert.match(edit, /replace\(\/\^\\\+91/);
  assert.match(edit, /EmailVerificationPanel initialEmail=\{initialEmail\} compact/);
  assert.doesNotMatch(edit, /Verified phone:/);
  assert.match(email, /aria-label="Send email code"/);
  assert.match(email, /Six-digit email code/);
  assert.match(email, /Verify email/);
  assert.doesNotMatch(account, /Phone[\s\S]{0,120}Verified/);
});

test("reviewed checkout never traps the customer while restoring the cart", () => {
  const checkout = source("../features/checkout/screens/Checkout.tsx");

  assert.match(checkout, /ensureCheckoutCart\(currentCheckout\.orders\)/);
  assert.match(checkout, /handleBackToCart/);
  assert.match(checkout, /removeItem\(CHECKOUT_ID_KEY\)/);
  // Clear section titles, no "Step n" eyebrows; each problem shows in the section that fixes it.
  assert.doesNotMatch(checkout, /Step \d/);
  assert.match(checkout, /addressProblem/);
  assert.match(checkout, /cartProblem/);
  assert.match(checkout, /CART_NOTICE_KEY/);
  assert.match(checkout, /navigate\(\{ to: "\/cart" \}\)/);
  assert.match(checkout, /Promise\.race/);
  assert.match(checkout, /Your cart is open/);
  assert.doesNotMatch(checkout, /Your reviewed order could not be restored to the cart/);
});

test("access-token expiry preserves refresh login instead of bouncing customers to landing", () => {
  const authMe = source("../app/api/auth/me/route.ts");
  const authClient = source("../features/auth/api/cravesAuth.ts");
  const sessionFetch = source("../shared/lib/session-fetch.ts");

  assert.doesNotMatch(authMe, /clearSessionCookies/);
  assert.match(authClient, /refreshSessionForGeneration/);
  assert.match(authClient, /sessionRefreshes/);
  assert.match(authClient, /fetch\("\/api\/auth\/refresh"/);
  assert.match(authClient, /if \(response\.status === 401\)/);
  assert.match(sessionFetch, /refreshSession\(\)/);
  assert.match(sessionFetch, /refreshSessionCookies/);
  assert.match(sessionFetch, /response\.status !== 401/);
  assert.match(sessionFetch, /status: 503/);
});

test("profile destinations preserve contextual back navigation", () => {
  const boundary = source("../shared/components/navigation/ContextualBackBoundary.tsx");
  const wishlistRoute = source("../app/wishlist/page.tsx");
  const notificationsRoute = source("../app/notifications/page.tsx");
  const subscriptionsRoute = source("../app/subscriptions/page.tsx");
  const contactRoute = source("../app/contact/page.tsx");
  const policy = source("../features/legal/components/PublicPolicyPage.tsx");

  assert.match(boundary, /consumeReturnRoute/);
  assert.match(boundary, /isBackControl/);
  assert.match(wishlistRoute, /destination="\/wishlist"/);
  assert.match(notificationsRoute, /destination="\/notifications"/);
  assert.match(subscriptionsRoute, /destination="\/subscriptions"/);
  assert.match(contactRoute, /destination="\/contact"/);
  assert.match(policy, /data-contextual-back="true"/);
});

test("favorites hydrate the shared cart and notifications offer read-all and undoable clears", () => {
  const wishlist = source("../features/favorites/screens/Wishlist.tsx");
  const notifications = source("../features/notifications/screens/Notifications.tsx");
  const readAll = source("../app/api/notifications/in-app/read-all/route.ts");

  assert.match(wishlist, /loadCart\(\)/);
  assert.match(wishlist, /CustomerFloatingCart/);
  assert.match(wishlist, /CustomerPageSkeleton/);
  assert.match(notifications, /Mark all as read/);
  assert.match(notifications, /fetch\("\/api\/notifications\/in-app\/read-all"/);
  assert.match(notifications, /<UndoToast/);
  assert.match(notifications, /CustomerPageSkeleton/);
  assert.match(notifications, /Clear read/);
  assert.match(notifications, /Clear all/);
  assert.match(notifications, /craves\.notifications\.cleared:/);
  assert.match(readAll, /\/notifications\/in-app\/read-all/);
  assert.match(readAll, /isSameOrigin\(request\)/);
});

test("navigation shows page-shaped skeletons the moment a dish, kitchen or cart opens", () => {
  const skeleton = source("../shared/components/loading/CustomerPageSkeleton.tsx");
  const kitchens = source("../features/home/components/KitchensGrid.tsx");

  for (const [route, variant] of [
    ["../app/dish/[id]/loading.tsx", "dish"],
    ["../app/kitchen/[id]/loading.tsx", "kitchen"],
    ["../app/kitchens/[id]/loading.tsx", "kitchen"],
    ["../app/cart/loading.tsx", "cart"],
  ] as const) {
    assert.match(source(route), new RegExp(`<CustomerPageSkeleton variant="${variant}"`), route);
  }
  for (const [screen, variant] of [
    ["../features/dish/screens/FoodDetails.tsx", "dish"],
    ["../features/chefs/screens/ChefProfile.tsx", "kitchen"],
    ["../features/chefs/screens/AllChefs.tsx", "chefs"],
    ["../features/cart/screens/Cart.tsx", "cart"],
  ] as const) {
    assert.match(source(screen), new RegExp(`<CustomerPageSkeleton variant="${variant}"`), screen);
  }
  assert.match(skeleton, /export type CustomerPageSkeletonVariant = "home" \| "dish" \| "kitchen" \| "cart" \| "chefs"/);
  // The dish skeleton reserves the action bar so the tab bar does not flash in and out.
  assert.match(skeleton, /data-craves-action-bar/);
  assert.match(kitchens, /\$\{skeletonStyles\.block\} aspect-\[16\/9\]/);
});

test("every page loads in its own shape under its own header, and quick loads show nothing", () => {
  for (const [screen, variant] of [
    ["../features/profile/screens/Profile.tsx", "profile"],
    ["../features/notifications/screens/Notifications.tsx", "notifications"],
    ["../features/favorites/screens/Wishlist.tsx", "saved"],
    ["../features/checkout/screens/Checkout.tsx", "checkout"],
    ["../features/checkout/components/customer-checkout.tsx", "checkout-details"],
    ["../features/orders/screens/OrderHistory.tsx", "orders"],
    ["../features/orders/components/CustomerOrderStatus.tsx", "order"],
    ["../features/orders/screens/OrderTracking.tsx", "tracking"],
    ["../features/addresses/screens/Addresses.tsx", "addresses"],
    ["../features/meal-plans/components/subscription-plan-browser.tsx", "plans"],
    ["../features/meal-plans/components/subscription-enrollment-form.tsx", "plan-form"],
    ["../features/meal-plans/components/subscription-details.tsx", "plan-details"],
  ] as const) {
    const contents = source(screen);
    assert.match(contents, new RegExp(`<CustomerSectionSkeleton variant="${variant}"`), screen);
    // Never Home's shape (the default variant) on a page that is not Home, and no bare pulse boxes.
    assert.doesNotMatch(contents, /<CustomerPageSkeleton(?![^>]*variant=)/, screen);
    assert.doesNotMatch(contents, /animate-pulse|Loading checkout…/, screen);
  }
  // Route changes to pages with their own header show that page's shape at once.
  for (const [route, variant] of [
    ["../app/orders/loading.tsx", "orders"],
    ["../app/orders/[orderId]/loading.tsx", "order"],
    ["../app/orders/[orderId]/tracking/loading.tsx", "tracking"],
    ["../app/addresses/loading.tsx", "addresses"],
  ] as const) {
    assert.match(source(route), new RegExp(`<CustomerRouteSkeleton[\\s\\S]*variant="${variant}"`), route);
  }
  // Blocks fade in only after 300 ms, so fast loads and quick revisits never flash a skeleton.
  assert.match(source("../shared/components/loading/CustomerPageSkeleton.module.css"), /cravesSkeletonReveal 200ms ease-out 300ms both/);
  assert.match(source("../features/chef/styles/chef-mode.css"), /chefSkeletonReveal 200ms ease-out 300ms both/);
  // Chef access check: the page's own shape, never invisible grey slabs; no false empty states.
  const boundary = source("../features/chef/components/chef-access-boundary.tsx");
  assert.match(boundary, /<ChefLoading shape=\{loadingShape\}/);
  assert.doesNotMatch(boundary, /animate-pulse/);
  assert.match(source("../features/chef/components/chef-subscription-plan-manager.tsx"), /if \(!loaded\) return <ChefLoading shape="plans"/);
  assert.match(source("../features/chef/components/chef-capacity-quick-setup.tsx"), /if \(message === LOADING_PLATES\) return <ChefLoading/);
  assert.doesNotMatch(source("../features/chef-onboarding/styles/chef-onboarding.css"), /#f2d3cf/i);
});

test("photos show instantly from cache and dish photos swipe natively", () => {
  const progressiveImage = source("../shared/components/media/ProgressiveImage.tsx");
  const dishHeader = source("../features/dish/components/DishImageHeader.tsx");
  const card = source("../features/home/components/DishCard.tsx");

  assert.match(progressiveImage, /image\?\.complete && image\.naturalWidth > 0/);
  assert.match(progressiveImage, /instant \? "transition-\[scale\]" : "transition-\[opacity,scale\]"/);
  assert.doesNotMatch(card, /transition-transform/);
  assert.match(card, /className="object-cover group-hover:scale-\[1\.03\]"/);

  // No remount per photo: a snap strip follows the finger; arrows and thumbnails scroll it.
  assert.doesNotMatch(dishHeader, /key=\{activeImage\}/);
  assert.match(dishHeader, /snap-x snap-mandatory overflow-x-auto/);
  assert.match(dishHeader, /onClick=\{\(\) => showIndex\(index\)\}/);
  assert.doesNotMatch(dishHeader, /backdrop-blur/);
});
