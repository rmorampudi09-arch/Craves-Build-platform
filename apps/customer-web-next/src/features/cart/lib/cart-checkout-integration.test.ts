import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("cart has no demo or local mutation fallback", () => {
  const cart = source("../api/cravesCart.ts");
  assert.match(cart, /sessionFetch\(path/);
  assert.match(cart, /\/api\/cart/);
  assert.match(cart, /throw error/);
  assert.doesNotMatch(cart, /demo|localStorage|sessionStorage|fallback/i);
  assert.doesNotMatch(cart, /crypto\.randomUUID/);
});

test("cart validates with the backend before address selection", () => {
  const page = source("../screens/Cart.tsx");
  const bar = source("../components/CartCheckoutBar.tsx");
  const cartService = source("../api/cravesCart.ts");
  assert.match(page, /await validateCart\(\)/);
  assert.match(page, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.match(page, /cartCurrency\(\)/);
  // Continue is the screen's one brand primary (hover and disabled live in craves-theme.css).
  assert.match(bar, /craves-primary-action/);
  assert.match(bar, /aria-busy=\{disabled\}/);
  assert.match(cartService, /await cartRequest\("\/api\/cart", \{ method: "DELETE" \}\)/);
  assert.match(cartService, /return cartMatchesCheckout\(expected\)/);
});

test("cart and checkout do not block first render on prep-time enrichment", () => {
  const cart = source("../screens/Cart.tsx");
  const checkout = source("../../checkout/screens/Checkout.tsx");

  assert.match(cart, /async function resolveLeadMinutes/);
  assert.match(
    cart,
    /setItems\(nextItems\)[\s\S]{0,420}setLoading\(false\)[\s\S]{0,220}void resolveLeadMinutes\(nextItems\)/,
  );
  assert.match(checkout, /async function resolveLeadMinutes/);
  assert.match(
    checkout,
    /setItems\(nextItems\)[\s\S]{0,260}setLoading\(false\)[\s\S]{0,260}void resolveLeadMinutes\(nextItems\)/,
  );
});

test("checkout uses the idempotent backend operation with an exact cart snapshot", () => {
  const page = source("../../checkout/screens/Checkout.tsx");
  const cartPage = source("../screens/Cart.tsx");
  assert.match(page, /parseCustomerAddresses\(raw\)/);
  assert.match(page, /filter\(isDeliveryReadyAddress\)/);
  assert.match(
    page,
    /activeAddresses\.find\(\(address\) => address\.isDefault\)[\s\S]{0,180}activeAddresses\.find\(\(address\) => address\.id === lastUsedId\)/,
  );
  assert.match(page, /\/api\/checkout\/operations\//);
  assert.match(page, /checkoutCartSnapshot\(validatedCart\)/);
  assert.match(page, /parseCheckoutOperationResponse\(raw\)/);
  assert.match(page, /CHECKOUT_OPERATION_ID_KEY/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /fetchCheckoutOperation\(storedOperationId\)/);
  assert.match(page, /fetchCheckout\(operation\.checkoutId\)/);
  assert.match(page, /createAuthoritativeCheckout/);
  assert.match(page, /deliveryAddressId,/);
  assert.match(page, /parseCheckout\(raw\)/);
  assert.match(page, /CHECKOUT_ID_KEY/);
  assert.match(page, /fetchCheckout\(storedCheckoutId\)/);
  assert.match(page, /window\.sessionStorage\.setItem\(CHECKOUT_ID_KEY, prepared\.id\)/);
  assert.doesNotMatch(page, /sessionFetch\("\/api\/checkout",/);
  assert.match(cartPage, /removeItem\(CHECKOUT_OPERATION_ID_KEY\)/);
  assert.doesNotMatch(
    page,
    /<AddressEditorFlow[\s\S]{0,320}\baddresses=/,
  );
  assert.doesNotMatch(page, /deliveryFee\s*=|platformFee\s*=|taxAmount\s*=/);
});

test("Razorpay payment is contract validated and backend verified", () => {
  const payment = source("../../checkout/components/CheckoutPaymentButton.tsx");
  assert.match(payment, /https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js/);
  assert.match(payment, /parsePaymentSession\(raw\)/);
  assert.match(payment, /parsePaymentStatus\(raw\)/);
  assert.match(payment, /parsePaymentVerification\(raw\)/);
  assert.match(payment, /\/api\/payments\/orders/);
  assert.match(payment, /sessionFetch/);
  assert.match(payment, /const session = await loadSession\(\)/);
  assert.match(payment, /if \(!checkout\) \{[\s\S]*await ensureCheckout\(\);[\s\S]*return;/);
  assert.match(payment, /Preparing total/);
  assert.match(payment, /craves-primary-action/);
  assert.doesNotMatch(payment, /"Review total"/);
  assert.match(payment, /\/verify/);
  assert.doesNotMatch(
    payment,
    /<(input|textarea)[^>]*(name|id|autoComplete)=[^>]*(card|cvv|upi[-_ ]?pin)/i,
  );
  assert.match(payment, /amount:\s*payment\.amountPaise/);
  assert.match(payment, /router\.replace\(\`\/orders\/\$\{orderId\}\?paid=1\`\)/);
  assert.doesNotMatch(payment, /amount\s*:\s*Math\.round\(/);
});

test("cart quantities are optimistic: steppers never dim and Continue waits only for validation", () => {
  const cartService = source("../api/cravesCart.ts");
  const page = source("../screens/Cart.tsx");
  const row = source("../components/CartItemRow.tsx");
  const card = source("../../home/components/DishCard.tsx");

  // Behaviour is exercised in optimistic-cart.vitest.ts; these pin the wiring.
  assert.match(cartService, /QUANTITY_WRITE_DELAY_MS = 250/);
  assert.match(cartService, /function serialized</);
  assert.match(cartService, /if \(intents\.get\(menuItemId\)\?\.seq === seq\) settle\(menuItemId, error\)/);
  assert.match(cartService, /await settleIntents\(\);\s*return cartRequest\("\/api\/cart\/validate"/);
  assert.match(cartService, /await cartRequest\("\/api\/cart", \{ method: "DELETE" \}, true\)/);

  assert.match(page, /disabled=\{validating\}/);
  assert.doesNotMatch(page, /busyItemId/);
  assert.doesNotMatch(row, /disabled=\{disabled|disabled:opacity/);
  assert.doesNotMatch(card, /disabled=\{state === "busy"|disabled:opacity-50/);
  // "Added" is announced, not shown as a line that pushes every card below it down.
  assert.match(card, /<p className="sr-only" role="status" aria-live="polite">/);
});

test("cart rows leave smoothly and the undo snackbar can actually be reached", () => {
  const page = source("../screens/Cart.tsx");
  const list = source("../components/CartItemList.tsx");

  // Rows: fade out of the flow while the rows below glide up (transform-based layout animation).
  assert.match(list, /<AnimatePresence mode="popLayout" initial=\{false\}>/);
  assert.match(list, /layout="position"/);
  assert.match(list, /key=\{item\.menuItemId\}/);

  // Undo: 8 s, announced, pauses while hovered or focused.
  assert.match(page, /UNDO_VISIBLE_MS = 10_000/);
  assert.match(page, /role="status"\s*aria-live="polite"/);
  assert.match(page, /onPointerEnter=\{pauseUndoTimer\}/);
  assert.match(page, /onFocus=\{pauseUndoTimer\}/);
  assert.match(page, /<Link\s+to="\/kitchen\/\$id"/);
  assert.doesNotMatch(page, /<a\s+href=\{`\/kitchen/);
  assert.doesNotMatch(page, /bg-\[#F62E18\]\/5|bg-\[#FFF8EC\]|#F6B545/);
});
