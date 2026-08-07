import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const theme = source("../craves-theme.css");
const hero = source("../components/sections/HeroSection.tsx");
const footer = source("../components/sections/FooterSection.tsx");
const howItWorks = source("../components/sections/HowItWorksSection.tsx");
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const welcome = source("../components/home/WelcomeBanner.tsx");
const checkout = source("../screens/Checkout/Checkout.tsx");
const orders = source("../screens/OrderHistory/OrderHistory.tsx");
const cart = source("../screens/Cart/Cart.tsx");
const notifications = source("../screens/Notifications/Notifications.tsx");
const addressDialog = source("../components/checkout/CheckoutAddressDialog.tsx");
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

test("buttons use white surfaces without logo-colored borders and keep the requested hover state", () => {
  assert.match(theme, /button, \[role="tab"\]/);
  assert.match(theme, /border:\s*1px solid transparent\s*!important/);
  assert.doesNotMatch(
    theme,
    /border:\s*1px solid var\(--color-flame-red\)\s*!important/,
  );
  assert.match(theme, /background:\s*var\(--color-white\)\s*!important/);
  assert.match(theme, /color:\s*var\(--color-black\)\s*!important/);
  assert.match(theme, /background:\s*var\(--color-flame-red\)\s*!important/);
  assert.match(theme, /color:\s*var\(--color-white\)\s*!important/);
  assert.match(theme, /font-weight:\s*700\s*!important/);
});

test("landing hero uses the supplied chef artwork on a white surface with logo-red ghost word", () => {
  assert.match(hero, /craves-chef-hero-reference\.jpg/);
  assert.match(hero, /bg-white text-black/);
  assert.match(hero, /rgba\(246, 46, 24, 0\.08\)/);
  assert.match(hero, /<CravesLogo size="md" priority \/>/);
  assert.doesNotMatch(hero, /min-h-\[46rem\].*bg-\[#F62E18\].*text-white/);
});

test("public landing surface and footer reference stay white without replacing the canonical logo", () => {
  assert.match(landing, /min-h-screen bg-white text-ink/);
  assert.match(landing, /items-center justify-center bg-white px-4/);
  assert.match(howItWorks, /section className="bg-white py-20"/);
  assert.match(footer, /craves-footer-reference\.jpg/);
  assert.match(footer, /<CravesLogo size="lg" \/>/);
  assert.match(footer, /bg-white\/75/);
  assert.doesNotMatch(landing, /min-h-screen bg-cream text-ink/);
});

test("welcome banner is solid contrast red with white copy", () => {
  assert.match(welcome, /bg-\[#C92716\]/);
  assert.match(welcome, /Welcome back, \{firstName\}/);
  assert.match(welcome, /Fresh dishes available around your delivery address\./);
  assert.match(welcome, /text-white/);
  assert.doesNotMatch(welcome, /blur-|gradient|bg-primary\/25/);
});

test("meal plans keep their previous card layout and navigation flow", () => {
  assert.match(mealPlans, /meal-plans-legacy-ui/);
  assert.match(mealPlans, /rounded-\[28px\] bg-\[#FFF8EC\]/);
  assert.match(mealPlans, /subscriptions\/new\?planId=/);
  assert.match(mealPlans, /craves-button-link/);
  assert.match(mealPlanPage, /bg-\[#0B1426\]/);
});

test("checkout shows only the current address and manages all addresses in a dialog", () => {
  assert.match(checkout, /CheckoutAddressDialog/);
  assert.match(checkout, /Only the address selected for this checkout is shown here/);
  assert.match(checkout, /Manage address/);
  assert.match(checkout, /onAddressesChange=\{setAddresses\}/);
  assert.doesNotMatch(checkout, /<fieldset/);
  assert.doesNotMatch(checkout, /addresses\.map/);

  assert.match(addressDialog, /role="dialog"/);
  assert.match(addressDialog, /fetch\("\/api\/customer\/addresses"/);
  assert.match(addressDialog, /method:\s*"POST"/);
  assert.match(addressDialog, /parseCustomerAddresses/);
  assert.match(addressDialog, /Add new address/);
  assert.match(addressDialog, /Save and use this address/);
});

test("customer orders page uses a white page surface", () => {
  assert.match(orders, /min-h-screen bg-white pb-20 text-ink/);
  assert.doesNotMatch(orders, /min-h-screen bg-cream pb-20 text-ink/);
});

test("customer cart and notifications use white page surfaces", () => {
  assert.match(cart, /min-h-screen bg-white pb-32 text-ink/);
  assert.doesNotMatch(cart, /min-h-screen bg-cream pb-32 text-ink/);
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
