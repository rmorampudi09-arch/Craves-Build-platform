import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCustomer360Response,
  parseCustomerOrderPage,
  parseCustomerPaymentPage,
  parseCustomerRefundPage,
} from "./admin-customer-360-contract.ts";

const customerIdentityId = "cc62bb4f-f06a-4a2c-9dc3-cdc518be8b02";
const orderId = "998ec1b8-1b7f-4e60-89e5-a5eb4ed6da1b";
const paymentId = "2d226d78-90e7-4bdf-abde-31a7f5a28651";
const refundId = "3d226d78-90e7-4bdf-abde-31a7f5a28651";

const orders = {
  customerIdentityId,
  items: [{
    orderId,
    checkoutId: null,
    kitchenId: null,
    kitchenName: "Home Kitchen",
    status: "DELIVERED",
    currency: "INR",
    grandTotal: 299,
    orderSource: "CUSTOMER_WEB",
    deliveryStatus: "DELIVERED",
    deliveryProviderId: "BORZO",
    refundId: null,
    refundProviderStatus: null,
    createdAt: "2026-08-20T05:00:00Z",
    updatedAt: "2026-08-20T06:00:00Z",
    internalRowVersion: 99,
  }],
  hasMore: false,
  nextBeforeCreatedAt: null,
  nextBeforeOrderId: null,
};

const payments = {
  customerIdentityId,
  items: [{
    paymentOrderId: paymentId,
    checkoutId: null,
    cravesReference: "CRV-1001",
    provider: "RAZORPAY",
    providerOrderId: "order_RZP_1",
    providerPaymentId: "pay_RZP_1",
    amount: 299,
    currency: "INR",
    status: "PAID",
    providerStatus: "captured",
    createdAt: "2026-08-20T05:00:00Z",
    updatedAt: "2026-08-20T05:01:00Z",
    providerSecret: "must-not-pass-through",
  }],
  hasMore: false,
  nextBeforeCreatedAt: null,
  nextBeforePaymentId: null,
};

const refunds = {
  customerIdentityId,
  items: [{
    refundId,
    paymentOrderId: paymentId,
    checkoutId: null,
    chefSubOrderId: null,
    provider: "RAZORPAY",
    providerOrderId: "order_RZP_1",
    providerPaymentId: "pay_RZP_1",
    providerRefundId: "rfnd_RZP_1",
    amount: 50,
    currency: "INR",
    reason: "Partial item issue",
    status: "PROCESSED",
    providerStatus: "processed",
    processedAt: "2026-08-20T07:00:00Z",
    createdAt: "2026-08-20T06:30:00Z",
    updatedAt: "2026-08-20T07:00:00Z",
    rawWebhookPayload: "must-not-pass-through",
  }],
  hasMore: false,
  nextBeforeCreatedAt: null,
  nextBeforeRefundId: null,
};

test("Customer 360 accepts bounded order/payment/refund pages", () => {
  const parsed = parseCustomer360Response({ orders, payments, refunds, errors: {} });
  assert.equal(parsed?.orders?.items[0]?.orderId, orderId);
  assert.equal(parsed?.payments?.items[0]?.provider, "RAZORPAY");
  assert.equal(parsed?.refunds?.items[0]?.providerRefundId, "rfnd_RZP_1");
});

test("Customer 360 strips undeclared operational fields", () => {
  const parsed = parseCustomer360Response({ orders, payments, refunds, errors: {} });
  assert.equal("internalRowVersion" in (parsed?.orders?.items[0] ?? {}), false);
  assert.equal("providerSecret" in (parsed?.payments?.items[0] ?? {}), false);
  assert.equal("rawWebhookPayload" in (parsed?.refunds?.items[0] ?? {}), false);
});

test("Customer 360 rejects unbounded or malformed pages", () => {
  assert.equal(parseCustomerOrderPage({ ...orders, items: Array.from({ length: 102 }, () => orders.items[0]) }), null);
  assert.equal(parseCustomerPaymentPage({ ...payments, items: [{ ...payments.items[0], amount: "299" }] }), null);
  assert.equal(parseCustomerRefundPage({ ...refunds, items: [{ ...refunds.items[0], provider: null }] }), null);
});

test("Customer 360 preserves section-level service errors", () => {
  const parsed = parseCustomer360Response({ orders, payments: null, refunds, errors: { payments: "SERVICE_UNAVAILABLE" } });
  assert.equal(parsed?.payments, null);
  assert.equal(parsed?.errors.payments, "SERVICE_UNAVAILABLE");
});
