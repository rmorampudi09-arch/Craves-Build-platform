import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const theme = source("../craves-theme.css");
const footer = source("../components/sections/FooterSection.tsx");
const referenceHero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const referenceArtwork = source(
  "../components/sections/landing-reference/ReferenceArtworkSection.tsx",
);
const referenceCrop = source(
  "../components/sections/landing-reference/ReferenceImageCrop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
const welcome = source("../components/home/WelcomeBanner.tsx");
const floatingCart = source("../components/home/FloatingCartBar.module.css");
const cartAddressDialog = source("../components/home/CartAddressAvailabilityDialog.tsx");
const addresses = source("../screens/Profile/Addresses.tsx");
const checkout = source("../screens/Checkout/Checkout.tsx");
const orders = source("../screens/OrderHistory/OrderHistory.tsx");
const cart = source("../screens/Cart/Cart.tsx");
const notifications = source("../screens/Notifications/Notifications.tsx");
const addressEditor = source("../components/profile/AddressEditorFlow.tsx");
const chefActions = source("../components/chef-order-actions.tsx");
const mealPlans = source("../components/subscription-plan-browser.tsx");
const mealPlanPage = source("../app/subscriptions/plans/page.tsx");

test("shared customer and chef palette removes espresso brown", () => {
  assert.doesNotMatch(theme, /#261a15/i);
  assert.doesNotMatch(theme, /rgba\(38,\s*26,\s*21/i);
  assert.match(theme, /--color-contrast-red:\s*#c92716/i);
  assert.match(theme, /--color-flame-red:\s*#f62e18/i);
  assert.match(theme, /--color-white:\s*#ffffff/i);
  assert.match(theme, /--color-black:\s*#000000/i);
});

test("buttons use neutral tactile hover while primary actions keep the Craves accent", () => {
  assert.match(theme, /button, \[role="tab"\]/);
  assert.match(theme, /border:\s*1px solid var\(--color-grey-200\)/);
  assert.match(theme, /background:\s*var\(--color-white\)/);
  assert.match(theme, /border-color:\s*#d7dadf/);
  assert.match(theme, /box-shadow:\s*0 4px 12px rgba\(0, 0, 0, 0\.08\)/);
  assert.match(theme, /\.btn-primary \{/);
  assert.match(theme, /background:\s*var\(--color-contrast-red\)/);
  assert.match(theme, /\.btn-primary:not\(:disabled\):hover/);
});

test("landing hero uses semantic HTML, canonical logo, approved rider artwork and wired controls", () => {
  assert.match(referenceHero, /import \{ CravesLogo \}/);
  assert.match(referenceHero, /<CravesLogo size="lg" priority \/>/);
  assert.match(referenceHero, /The Taste of Home,/);
  assert.match(referenceHero, /Now Closer\./);
  assert.match(referenceHero, /Order Homemade Food/);
  assert.match(referenceHero, /Watch How It Works/);
  assert.match(referenceHero, /onOpenAuth\("login"\)/);
  assert.match(referenceHero, /onOpenLocation/);
  assert.match(referenceHero, /onBecomeChef/);
  assert.match(referenceHero, /src="\/landing\/reference\/hero-reference\.png"/);
  assert.match(referenceHero, /<ReferenceImageCrop/);
  assert.doesNotMatch(referenceHero, /referenceHotspot/);
});

test("landing precision fixes remove baked rider text, align steps and normalize chef navigation hover", () => {
  assert.match(referenceHero, /href="#become-a-chef"/);
  assert.doesNotMatch(referenceHero, /className=\{styles\.referenceNavButton\}/);
  assert.match(referenceHero, /top-\[84\.4%\]/);
  assert.match(referenceHero, /h-\[5\.2%\]/);
  assert.match(referenceHero, /w-\[7\.4%\]/);
  assert.match(referenceHero, /!min-h-0/);

  assert.match(
    referenceArtwork,
    /lg:h-\[clamp\(14rem,22vw,21rem\)\]/,
  );
  assert.match(referenceArtwork, /items-end justify-center/);
  assert.match(referenceArtwork, /referenceHowArtwork\} !m-0/);
});

test("public landing keeps the approved semantic reference experience and wired flows", () => {
  assert.match(landing, /min-h-screen bg-white text-ink/);
  assert.match(landing, /items-center justify-center bg-white px-4/);
  assert.match(landing, /<ReferenceHeroDesktop/);
  assert.match(landing, /<ReferenceArtworkSection variant="how"/);
  assert.match(landing, /<ReferenceArtworkSection variant="why"/);
  assert.match(landing, /variant="chefs-app"/);
  assert.match(landing, /<AuthModal/);
  assert.match(landing, /<LocationModal/);
  assert.doesNotMatch(landing, /<CommunityImpactSection/);
  assert.doesNotMatch(landing, /<AppDownloadSection/);

  assert.match(referenceArtwork, /From their kitchen to/);
  assert.match(referenceArtwork, /your table\./);
  assert.match(referenceArtwork, /Food the way it/);
  assert.match(referenceArtwork, /should be\./);
  assert.match(referenceArtwork, /Every order supports/);
  assert.match(referenceArtwork, /real people/);
  assert.match(referenceArtwork, /Real kitchens\./);
  assert.match(referenceArtwork, /Real people\./);
  assert.match(referenceArtwork, /Real passion\./);
  assert.match(referenceArtwork, /Homemade food,/);
  assert.match(referenceArtwork, /in your pocket\./);
  assert.match(referenceArtwork, /Become a Home Chef/);
  assert.match(referenceArtwork, /id="craves-app"/);

  assert.match(referenceCrop, /unoptimized/);
  assert.match(referenceCrop, /approved reference PNG/);
  assert.match(referenceCrop, /style=\{imageStyle\}/);

  assert.match(footer, /<CravesLogo size="lg" \/>/);
  assert.match(footer, /bg-\[#111111\] text-white/);
  assert.doesNotMatch(landing, /min-h-screen bg-cream text-ink/);
});

test("welcome banner stays focused on home content while discovery uses the saved default address", () => {
  assert.match(welcome, /src="\/home\/reference\/home-hero-reference\.webp"/);
  assert.match(welcome, /styles\.heroArtwork/);
  assert.match(welcome, /Welcome home, \{firstName\}/);
  assert.match(welcome, /Eat for Health\./);
  assert.match(welcome, /Taste the Comfort of Home\./);
  assert.match(welcome, /dishCount/);
  assert.doesNotMatch(welcome, /<button/);
  assert.doesNotMatch(welcome, /Default address/);
  assert.doesNotMatch(welcome, /Choose default address/);
  assert.doesNotMatch(welcome, /Use current delivery location/);
  assert.doesNotMatch(welcome, /Current Location/);

  assert.match(home, /loadSelectedAddress/);
  assert.match(home, /default delivery address/);
  assert.doesNotMatch(home, /navigator\.geolocation/);
  assert.doesNotMatch(home, /resolveLiveBrowsingLocation/);
});

test("address manager owns default selection and the shared location-first editor", () => {
  assert.match(addresses, /Add New Address/);
  assert.match(addresses, /Choose your default delivery address here/);
  assert.match(addresses, /Select as default/);
  assert.match(addresses, /Default address/);
  assert.match(addresses, /async function selectDefault/);
  assert.match(addresses, /invalidateHomeDeliveryContext/);
  assert.match(addresses, /invalidateSelectedAddress/);
  assert.match(addresses, /clearDishDiscoveryCache/);
  assert.match(addresses, /clearKitchenDiscoveryCache/);
  assert.match(addresses, /<AddressEditorFlow/);

  assert.match(addressEditor, /<Dialog\.Root/);
  assert.match(addressEditor, /<AddressMapPicker/);
  assert.doesNotMatch(addressEditor, /Search for area, street name/);
  assert.doesNotMatch(addressEditor, /Saved Addresses/);
  assert.match(addressEditor, /Use current location/);
  assert.match(addressEditor, /Add address details/);
  assert.match(addressEditor, /Name this address/);
  assert.match(addressEditor, /Please complete the highlighted fields/);
  assert.match(addressEditor, /Flat \/ house \/ floor/);
  assert.match(addressEditor, /Receiver&apos;s phone/);
  assert.match(addressEditor, /Save and use this address/);
  assert.doesNotMatch(addressEditor, /Skip/);
  assert.doesNotMatch(addressEditor, /Add later/);
});

test("home rechecks cart availability after default-address changes", () => {
  assert.match(home, /CartAddressAvailabilityDialog/);
  assert.match(home, /loadKitchenMenu/);
  assert.match(home, /unavailableCartItems/);
  assert.match(home, /removeFromCart/);
  assert.match(home, /clearCart/);
  assert.match(cartAddressDialog, /Choose another address/);
  assert.match(cartAddressDialog, /Remove unavailable items/);
  assert.match(cartAddressDialog, /Clear cart & browse here/);
});

test("home cart bar uses a balanced true frosted-glass blur", () => {
  assert.match(floatingCart, /background:\s*rgba\(255, 255, 255, 0\.5\)/);
  assert.match(floatingCart, /backdrop-filter:\s*blur\(30px\) saturate\(145%\)/);
  assert.match(floatingCart, /@supports not/);
});

test("meal plans keep their previous card layout and navigation flow", () => {
  assert.match(mealPlans, /meal-plans-legacy-ui/);
  assert.match(mealPlans, /rounded-\[28px\] bg-\[#FFF8EC\]/);
  assert.match(mealPlans, /subscriptions\/new\?planId=/);
  assert.match(mealPlans, /craves-button-link/);
  assert.match(mealPlanPage, /bg-\[#0B1426\]/);
});

test("checkout is one page with saved addresses, ASAP delivery and the shared address sheet", () => {
  assert.match(checkout, /Deliver to/);
  assert.match(checkout, /visibleAddresses\.map/);
  assert.match(checkout, /addresses\.slice\(0, 3\)/);
  assert.match(checkout, /Show all/);
  assert.match(checkout, /Earliest delivery/);
  assert.match(checkout, /As soon as possible/);
  assert.match(checkout, /Bill details/);
  assert.match(checkout, /<CheckoutPaymentButton/);
  assert.match(checkout, /<AddressEditorFlow/);
  assert.match(checkout, /sessionFetch\("\/api\/checkout"/);
  assert.match(checkout, /createAuthoritativeCheckout/);
  assert.match(checkout, /deliveryAddressId,/);
  assert.match(checkout, /window\.sessionStorage\.setItem\(CHECKOUT_ID_KEY, prepared\.id\)/);
  assert.match(checkout, /Review the order to load the authoritative delivery fee, tax and final total before payment/);
  assert.doesNotMatch(checkout, /CheckoutAddressDialog/);
  assert.doesNotMatch(checkout, /Pick a time/);
  assert.doesNotMatch(checkout, /schedule\/capability/);

  assert.match(addressEditor, /sessionFetch\(\s*targetAddressId/);
  assert.match(addressEditor, /method:\s*targetAddressId \? "PUT" : "POST"/);
  assert.match(addressEditor, /Save and use this address/);
});

test("customer orders page uses a white page surface", () => {
  assert.match(orders, /min-h-screen bg-white pb-20 text-ink/);
  assert.doesNotMatch(orders, /min-h-screen bg-cream pb-20 text-ink/);
});

test("customer cart and notifications use white page surfaces", () => {
  assert.match(cart, /min-h-screen bg-white pb-36 text-\[#1A1A1A\]/);
  assert.match(cart, /Cooking instructions/);
  assert.match(cart, /Add more from this kitchen/);
  assert.match(cart, /Undo/);
  assert.match(cart, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.doesNotMatch(cart, /min-h-screen bg-cream/);
  assert.match(notifications, /min-h-screen bg-white pb-12/);
  assert.match(notifications, /border-b border-border bg-white\/95/);
  assert.doesNotMatch(notifications, /min-h-screen bg-cream pb-12/);
  assert.doesNotMatch(notifications, /border-b border-border bg-cream\/95/);
});

test("chef accept and reject fields use one neutral border with no focus outline or ring", () => {
  assert.match(chefActions, /data-craves-single-border="true"/);
  assert.match(chefActions, /border border-border/);
  assert.match(chefActions, /focus:outline-none focus:ring-0/);
  assert.match(theme, /outline:\s*none\s*!important/);
  assert.match(
    theme,
    /border:\s*1px solid var\(--color-grey-200\)\s*!important/,
  );
  assert.doesNotMatch(
    theme,
    /border:\s*1px solid var\(--color-flame-red\)\s*!important/,
  );
});
