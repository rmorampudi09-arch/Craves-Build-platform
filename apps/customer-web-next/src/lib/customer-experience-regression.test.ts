import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("home uses a real banner, customer skeletons, sticky cravings and image-led chef cards", () => {
  const banner = source("../components/home/WelcomeBanner.tsx");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const chefs = source("../screens/public/AllChefs/AllChefs.tsx");
  const kitchens = source("../components/home/KitchensGrid.tsx");
  const cravings = source("../components/home/HomeCategoryRail.tsx");
  const header = source("../components/home/BrowseHeader.tsx");
  const skeleton = source("../components/loading/CustomerPageSkeleton.tsx");

  assert.match(banner, /home-hero-reference\.webp/);
  assert.match(banner, /unoptimized/);
  assert.match(home, /CustomerPageSkeleton/);
  assert.match(home, /dishImagesByKitchen=\{kitchenDishImages\}/);
  assert.match(chefs, /CustomerPageSkeleton/);
  assert.match(chefs, /discoverDishes\(/);
  assert.match(chefs, /dishImagesByKitchen=\{dishImagesByKitchen\}/);
  assert.match(kitchens, /KitchenDishPreview/);
  assert.match(kitchens, /window\.setInterval/);
  assert.match(kitchens, /ChevronLeft/);
  assert.match(kitchens, /ChevronRight/);
  assert.doesNotMatch(kitchens, /kitchenPreviewTrack/);
  assert.match(cravings, /sticky top-0 z-30/);
  assert.match(header, /hover:-translate-y-0\.5/);
  assert.match(header, /focus-within:bg-white/);
  assert.match(skeleton, /animate-pulse/);
});

test("profile edit stays focused on name, phone and optional OTP email verification", () => {
  const edit = source("../components/profile/EditProfileModal.tsx");
  const email = source("../components/auth/EmailVerificationPanel.tsx");
  const account = source("../components/profile/AccountCard.tsx");

  assert.match(edit, /Phone number/);
  assert.match(edit, /readOnly/);
  assert.match(edit, /body\.style\.overflow = "hidden"/);
  assert.match(edit, /overscroll-contain/);
  assert.match(edit, /replace\(\/\^\\\+91/);
  assert.match(edit, /EmailVerificationPanel initialEmail=\{initialEmail\} compact/);
  assert.doesNotMatch(edit, /Verified phone:/);
  assert.match(email, /Email <span[^>]*>\(optional\)<\/span>/);
  assert.match(email, /aria-label="Send email code"/);
  assert.match(email, /Six-digit email code/);
  assert.match(email, /Verify email/);
  assert.doesNotMatch(account, /Phone[\s\S]{0,120}Verified/);
});

test("reviewed checkout restores its server snapshot before returning to the cart", () => {
  const checkout = source("../screens/Checkout/Checkout.tsx");

  assert.match(checkout, /ensureCheckoutCart\(checkout\.orders\)/);
  assert.match(checkout, /handleBackToCart/);
  assert.match(checkout, /removeItem\(CHECKOUT_ID_KEY\)/);
  assert.match(checkout, /Step 1/);
  assert.match(checkout, /Step 2/);
  assert.match(checkout, /Step 3/);
});

test("profile destinations preserve contextual back navigation", () => {
  const boundary = source("../components/navigation/ContextualBackBoundary.tsx");
  const wishlistRoute = source("../app/wishlist/page.tsx");
  const notificationsRoute = source("../app/notifications/page.tsx");
  const subscriptionsRoute = source("../app/subscriptions/page.tsx");
  const contactRoute = source("../app/contact/page.tsx");
  const policy = source("../components/legal/PublicPolicyPage.tsx");

  assert.match(boundary, /consumeReturnRoute/);
  assert.match(boundary, /isBackControl/);
  assert.match(wishlistRoute, /destination="\/wishlist"/);
  assert.match(notificationsRoute, /destination="\/notifications"/);
  assert.match(subscriptionsRoute, /destination="\/subscriptions"/);
  assert.match(contactRoute, /destination="\/contact"/);
  assert.match(policy, /data-contextual-back="true"/);
});

test("favorites hydrate the shared cart and notifications expose only supported clear actions", () => {
  const wishlist = source("../screens/Wishlist/Wishlist.tsx");
  const notifications = source("../screens/Notifications/Notifications.tsx");
  const readAll = source("../app/api/notifications/in-app/read-all/route.ts");

  assert.match(wishlist, /loadCart\(\)/);
  assert.match(wishlist, /CustomerFloatingCart/);
  assert.match(wishlist, /CustomerPageSkeleton/);
  assert.doesNotMatch(notifications, /Mark all read/);
  assert.match(notifications, /Clear read/);
  assert.match(notifications, /Clear all/);
  assert.match(notifications, /craves\.notifications\.cleared:/);
  assert.match(readAll, /\/notifications\/in-app\/read-all/);
  assert.match(readAll, /isSameOrigin\(request\)/);
});
