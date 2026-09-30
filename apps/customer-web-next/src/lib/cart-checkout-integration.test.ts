import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("cart has no demo or local mutation fallback", () => {
  const cart = source("../services/api/cravesCart.ts");
  assert.match(cart, /sessionFetch\(path/);
  assert.match(cart, /\/api\/cart/);
  assert.match(cart, /throw error/);
  assert.doesNotMatch(cart, /demo|localStorage|sessionStorage|fallback/i);
  assert.doesNotMatch(cart, /crypto\.randomUUID/);
});

test("cart validates with the backend before address selection", () => {
  const page = source("../screens/Cart/Cart.tsx");
  const bar = source("../components/cart/CartCheckoutBar.tsx");
  const cartService = source("../services/api/cravesCart.ts");
  assert.match(page, /await validateCart\(\)/);
  assert.match(page, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.match(page, /cartCurrency\(\)/);
  assert.match(bar, /bg-\[#6B6B6B\]/);
  assert.match(bar, /hover:bg-\[#555555\]/);
  assert.match(cartService, /await cartRequest\("\/api\/cart", \{ method: "DELETE" \}\)/);
  assert.match(cartService, /return cartMatchesCheckout\(expected\)/);
});

test("checkout uses the idempotent backend operation with an exact cart snapshot", () => {
  const page = source("../screens/Checkout/Checkout.tsx");
  const cartPage = source("../screens/Cart/Cart.tsx");
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
  const payment = source("../components/checkout/CheckoutPaymentButton.tsx");
  assert.match(payment, /https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js/);
  assert.match(payment, /parsePaymentSession\(raw\)/);
  assert.match(payment, /parsePaymentStatus\(raw\)/);
  assert.match(payment, /parsePaymentVerification\(raw\)/);
  assert.match(payment, /\/api\/payments\/orders/);
  assert.match(payment, /sessionFetch/);
  assert.match(payment, /const session = await loadSession\(\)/);
  assert.match(payment, /if \(!checkout\) \{[\s\S]*await ensureCheckout\(\);[\s\S]*return;/);
  assert.match(payment, /Preparing total/);
  assert.match(payment, /bg-\[#16A34A\]/);
  assert.doesNotMatch(payment, /"Review total"/);
  assert.match(payment, /\/verify/);
  assert.doesNotMatch(
    payment,
    /<(input|textarea)[^>]*(name|id|autoComplete)=[^>]*(card|cvv|upi[-_ ]?pin)/i,
  );
  assert.match(payment, /amount:\s*payment\.amountPaise/);
  assert.match(payment, /router\.replace\(\`\/orders\/\$\{orderId\}\`\)/);
  assert.doesNotMatch(payment, /amount\s*:\s*Math\.round\(/);
});
