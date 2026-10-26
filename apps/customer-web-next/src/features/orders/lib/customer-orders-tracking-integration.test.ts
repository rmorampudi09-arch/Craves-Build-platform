import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("order history validates each page and falls back to the sorted latest list", () => {
  const page = source("../screens/OrderHistory.tsx");
  assert.match(page, /sessionFetch\(`\/api\/orders\/page\?limit=\$\{PAGE_SIZE\}/);
  assert.match(page, /parseCustomerOrderPage\(/);
  assert.match(page, /sessionFetch\("\/api\/orders"/);
  assert.match(page, /parseCustomerOrders\(raw\)/);
  assert.match(page, /new Date\(right\.createdAt\)\.getTime\(\)/);
  assert.doesNotMatch(page, /const orders = \[/);
});

test("each order opens its own order page, with the app's tabs and item line", () => {
  const page = source("../screens/OrderHistory.tsx");
  assert.match(page, /to=\{`\/orders\/\$\{order\.id\}`\}/);
  assert.match(page, /ORDER_TABS\.map/);
  assert.match(page, /orderItemsLine\(order\.items\)/);
});

test("tracking validates both order and delivery projections", () => {
  const page = source("../screens/OrderTracking.tsx");
  assert.match(page, /parseCustomerOrder\(orderRaw\)/);
  assert.match(page, /parseDeliveryStatusResponse\(deliveryRaw\)/);
  assert.match(page, /parsedDelivery\.orderId\.toLowerCase\(\)/);
  assert.match(page, /shouldAutoRefresh/);
});

test("provider link is HTTPS-sanitized by the delivery contract", () => {
  const contract = source("./delivery-status.ts");
  const page = source("../screens/OrderTracking.tsx");
  assert.match(contract, /url\.protocol === "https:"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /delivery\?\.trackingUrl/);
});
