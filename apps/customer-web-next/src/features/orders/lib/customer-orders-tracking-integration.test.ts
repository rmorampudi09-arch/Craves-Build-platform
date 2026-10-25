import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("order history validates and sorts backend orders", () => {
  const page = source("../screens/OrderHistory.tsx");
  assert.match(page, /fetch\("\/api\/orders"/);
  assert.match(page, /parseCustomerOrders\(raw\)/);
  assert.match(page, /new Date\(right\.createdAt\)\.getTime\(\)/);
  assert.doesNotMatch(page, /const orders = \[/);
});

test("each order opens its own order page, active orders first", () => {
  const page = source("../screens/OrderHistory.tsx");
  assert.match(page, /to=\{`\/orders\/\$\{order\.id\}`\}/);
  assert.match(page, /title: "In progress"[\s\S]{0,200}title: "Past orders"/);
  // Items read like the order page: "2 × Hyderabadi Chicken Dum Biryani".
  assert.match(page, /order\.items\.map\(\(item\) => `\$\{item\.quantity\} × \$\{item\.itemName\}`\)/);
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
