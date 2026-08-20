export type CustomerOrderSummary = {
  orderId: string;
  checkoutId: string | null;
  kitchenId: string | null;
  kitchenName: string | null;
  status: string;
  currency: string;
  grandTotal: number;
  orderSource: string | null;
  deliveryStatus: string | null;
  deliveryProviderId: string | null;
  refundId: string | null;
  refundProviderStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrderPage = {
  customerIdentityId: string;
  items: CustomerOrderSummary[];
  hasMore: boolean;
  nextBeforeCreatedAt: string | null;
  nextBeforeOrderId: string | null;
};

export type CustomerPaymentSummary = {
  paymentOrderId: string;
  checkoutId: string | null;
  cravesReference: string | null;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerPaymentPage = {
  customerIdentityId: string;
  items: CustomerPaymentSummary[];
  hasMore: boolean;
  nextBeforeCreatedAt: string | null;
  nextBeforePaymentId: string | null;
};

export type CustomerRefundSummary = {
  refundId: string;
  paymentOrderId: string | null;
  checkoutId: string | null;
  chefSubOrderId: string | null;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  providerStatus: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerRefundPage = {
  customerIdentityId: string;
  items: CustomerRefundSummary[];
  hasMore: boolean;
  nextBeforeCreatedAt: string | null;
  nextBeforeRefundId: string | null;
};

export type Customer360Response = {
  orders: CustomerOrderPage | null;
  payments: CustomerPaymentPage | null;
  refunds: CustomerRefundPage | null;
  errors: Partial<Record<"orders" | "payments" | "refunds", string>>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown, nullable = false): string | null {
  if (value === null || value === undefined) return nullable ? null : null;
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || value === undefined ? null : typeof value === "string" ? value : undefined;
}

export function parseCustomerOrderPage(value: unknown): CustomerOrderPage | null {
  const raw = object(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 101 || typeof raw.hasMore !== "boolean") return null;
  const customerIdentityId = requiredString(raw.customerIdentityId);
  const nextBeforeCreatedAt = nullableString(raw.nextBeforeCreatedAt);
  const nextBeforeOrderId = nullableString(raw.nextBeforeOrderId);
  if (!customerIdentityId || nextBeforeCreatedAt === undefined || nextBeforeOrderId === undefined) return null;
  const items = raw.items.map(item => {
    const row = object(item);
    if (!row) return null;
    const orderId = requiredString(row.orderId);
    const checkoutId = nullableString(row.checkoutId);
    const kitchenId = nullableString(row.kitchenId);
    const kitchenName = nullableString(row.kitchenName);
    const status = requiredString(row.status);
    const currency = requiredString(row.currency);
    const grandTotal = number(row.grandTotal);
    const orderSource = nullableString(row.orderSource);
    const deliveryStatus = nullableString(row.deliveryStatus);
    const deliveryProviderId = nullableString(row.deliveryProviderId);
    const refundId = nullableString(row.refundId);
    const refundProviderStatus = nullableString(row.refundProviderStatus);
    const createdAt = requiredString(row.createdAt);
    const updatedAt = requiredString(row.updatedAt);
    if (!orderId || checkoutId === undefined || kitchenId === undefined || kitchenName === undefined || !status || !currency || grandTotal === null || orderSource === undefined || deliveryStatus === undefined || deliveryProviderId === undefined || refundId === undefined || refundProviderStatus === undefined || !createdAt || !updatedAt) return null;
    return { orderId, checkoutId, kitchenId, kitchenName, status, currency, grandTotal, orderSource, deliveryStatus, deliveryProviderId, refundId, refundProviderStatus, createdAt, updatedAt };
  });
  if (items.some(item => item === null)) return null;
  return { customerIdentityId, items: items as CustomerOrderSummary[], hasMore: raw.hasMore, nextBeforeCreatedAt, nextBeforeOrderId };
}

export function parseCustomerPaymentPage(value: unknown): CustomerPaymentPage | null {
  const raw = object(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 101 || typeof raw.hasMore !== "boolean") return null;
  const customerIdentityId = requiredString(raw.customerIdentityId);
  const nextBeforeCreatedAt = nullableString(raw.nextBeforeCreatedAt);
  const nextBeforePaymentId = nullableString(raw.nextBeforePaymentId);
  if (!customerIdentityId || nextBeforeCreatedAt === undefined || nextBeforePaymentId === undefined) return null;
  const items = raw.items.map(item => {
    const row = object(item);
    if (!row) return null;
    const paymentOrderId = requiredString(row.paymentOrderId);
    const checkoutId = nullableString(row.checkoutId);
    const cravesReference = nullableString(row.cravesReference);
    const provider = requiredString(row.provider);
    const providerOrderId = nullableString(row.providerOrderId);
    const providerPaymentId = nullableString(row.providerPaymentId);
    const amount = number(row.amount);
    const currency = requiredString(row.currency);
    const status = requiredString(row.status);
    const providerStatus = nullableString(row.providerStatus);
    const createdAt = requiredString(row.createdAt);
    const updatedAt = requiredString(row.updatedAt);
    if (!paymentOrderId || checkoutId === undefined || cravesReference === undefined || !provider || providerOrderId === undefined || providerPaymentId === undefined || amount === null || !currency || !status || providerStatus === undefined || !createdAt || !updatedAt) return null;
    return { paymentOrderId, checkoutId, cravesReference, provider, providerOrderId, providerPaymentId, amount, currency, status, providerStatus, createdAt, updatedAt };
  });
  if (items.some(item => item === null)) return null;
  return { customerIdentityId, items: items as CustomerPaymentSummary[], hasMore: raw.hasMore, nextBeforeCreatedAt, nextBeforePaymentId };
}

export function parseCustomerRefundPage(value: unknown): CustomerRefundPage | null {
  const raw = object(value);
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 101 || typeof raw.hasMore !== "boolean") return null;
  const customerIdentityId = requiredString(raw.customerIdentityId);
  const nextBeforeCreatedAt = nullableString(raw.nextBeforeCreatedAt);
  const nextBeforeRefundId = nullableString(raw.nextBeforeRefundId);
  if (!customerIdentityId || nextBeforeCreatedAt === undefined || nextBeforeRefundId === undefined) return null;
  const items = raw.items.map(item => {
    const row = object(item);
    if (!row) return null;
    const refundId = requiredString(row.refundId);
    const paymentOrderId = nullableString(row.paymentOrderId);
    const checkoutId = nullableString(row.checkoutId);
    const chefSubOrderId = nullableString(row.chefSubOrderId);
    const provider = requiredString(row.provider);
    const providerOrderId = nullableString(row.providerOrderId);
    const providerPaymentId = nullableString(row.providerPaymentId);
    const providerRefundId = nullableString(row.providerRefundId);
    const amount = number(row.amount);
    const currency = requiredString(row.currency);
    const reason = nullableString(row.reason);
    const status = requiredString(row.status);
    const providerStatus = nullableString(row.providerStatus);
    const processedAt = nullableString(row.processedAt);
    const createdAt = requiredString(row.createdAt);
    const updatedAt = requiredString(row.updatedAt);
    if (!refundId || paymentOrderId === undefined || checkoutId === undefined || chefSubOrderId === undefined || !provider || providerOrderId === undefined || providerPaymentId === undefined || providerRefundId === undefined || amount === null || !currency || reason === undefined || !status || providerStatus === undefined || processedAt === undefined || !createdAt || !updatedAt) return null;
    return { refundId, paymentOrderId, checkoutId, chefSubOrderId, provider, providerOrderId, providerPaymentId, providerRefundId, amount, currency, reason, status, providerStatus, processedAt, createdAt, updatedAt };
  });
  if (items.some(item => item === null)) return null;
  return { customerIdentityId, items: items as CustomerRefundSummary[], hasMore: raw.hasMore, nextBeforeCreatedAt, nextBeforeRefundId };
}

export function parseCustomer360Response(value: unknown): Customer360Response | null {
  const raw = object(value);
  if (!raw) return null;
  const orders = raw.orders === null || raw.orders === undefined ? null : parseCustomerOrderPage(raw.orders);
  const payments = raw.payments === null || raw.payments === undefined ? null : parseCustomerPaymentPage(raw.payments);
  const refunds = raw.refunds === null || raw.refunds === undefined ? null : parseCustomerRefundPage(raw.refunds);
  if ((raw.orders && !orders) || (raw.payments && !payments) || (raw.refunds && !refunds)) return null;
  const rawErrors = object(raw.errors) ?? {};
  const errors: Customer360Response["errors"] = {};
  for (const key of ["orders", "payments", "refunds"] as const) {
    if (typeof rawErrors[key] === "string") errors[key] = rawErrors[key] as string;
  }
  return { orders, payments, refunds, errors };
}
