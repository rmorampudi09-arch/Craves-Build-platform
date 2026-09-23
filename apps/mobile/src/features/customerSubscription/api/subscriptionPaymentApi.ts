import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import type {PaymentMoney, PaymentProvider} from '../../payment/domain/paymentTypes';
import type {
  CreateSubscriptionPaymentOrderRequest,
  SubscriptionPayment,
  SubscriptionPaymentStatus,
  VerifySubscriptionPaymentRequest,
} from '../domain/subscriptionPaymentTypes';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RAZORPAY_ORDER_PATTERN = /^order_[A-Za-z0-9]+$/;
const RAZORPAY_PAYMENT_PATTERN = /^pay_[A-Za-z0-9]+$/;
const RAZORPAY_SIGNATURE_PATTERN = /^[a-f0-9]{64}$/i;

const PAYMENT_STATUSES = new Set<SubscriptionPaymentStatus>([
  'PAYMENT_REQUESTED',
  'PAYMENT_PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
]);
const PAYMENT_PROVIDERS = new Set<PaymentProvider>(['CASHFREE', 'RAZORPAY']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalBoundedString(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return boundedString(value, maxLength);
}

function parseUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseCurrency(value: unknown): string | null {
  const candidate = boundedString(value, 3);
  return candidate && CURRENCY_PATTERN.test(candidate) ? candidate : null;
}

function parseDecimal(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const normalized = String(value);
    return DECIMAL_PATTERN.test(normalized) ? normalized : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized) || Number(normalized) <= 0) return null;
  return normalized;
}

function parseMoney(value: unknown, currency: string): PaymentMoney | null {
  const amount = parseDecimal(value);
  return amount ? {amount, currency} : null;
}

function parseStatus(value: unknown): SubscriptionPaymentStatus | null {
  return typeof value === 'string' &&
    PAYMENT_STATUSES.has(value as SubscriptionPaymentStatus)
    ? (value as SubscriptionPaymentStatus)
    : null;
}

function parseProvider(value: unknown): PaymentProvider | null {
  return typeof value === 'string' && PAYMENT_PROVIDERS.has(value as PaymentProvider)
    ? (value as PaymentProvider)
    : null;
}

function requireUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_INVALID_ID',
      `${label} is not valid.`,
    );
  }
}

function requireCreateOrderRequest(
  request: CreateSubscriptionPaymentOrderRequest,
): CreateSubscriptionPaymentOrderRequest {
  const customerName = boundedString(request.customerName, 120);
  const customerPhone = boundedString(request.customerPhone, 20);
  const customerEmail = optionalBoundedString(request.customerEmail, 254);
  const returnUrl = optionalBoundedString(request.returnUrl, 500);

  if (!customerName) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_CUSTOMER_NAME_REQUIRED',
      'Add your name before starting subscription payment.',
    );
  }
  if (!customerPhone) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_CUSTOMER_PHONE_REQUIRED',
      'A verified phone number is required for subscription payment.',
    );
  }
  if (customerEmail && !EMAIL_PATTERN.test(customerEmail)) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_CUSTOMER_EMAIL_INVALID',
      'The customer email is not valid.',
    );
  }
  if (request.customerEmail !== undefined && request.customerEmail !== null &&
      request.customerEmail.trim() && !customerEmail) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_CUSTOMER_EMAIL_INVALID',
      'The customer email is not valid.',
    );
  }
  if (request.returnUrl !== undefined && request.returnUrl !== null &&
      request.returnUrl.trim() && !returnUrl) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_RETURN_URL_INVALID',
      'The subscription payment return URL is not valid.',
    );
  }

  return {
    customerName,
    customerPhone,
    ...(customerEmail ? {customerEmail} : {}),
    ...(returnUrl ? {returnUrl} : {}),
  };
}

function requireVerificationRequest(
  request: VerifySubscriptionPaymentRequest,
): VerifySubscriptionPaymentRequest {
  const providerOrderId = request.providerOrderId?.trim();
  const providerPaymentId = request.providerPaymentId?.trim();
  const providerSignature = request.providerSignature?.trim();

  if (
    !providerOrderId ||
    !RAZORPAY_ORDER_PATTERN.test(providerOrderId) ||
    !providerPaymentId ||
    !RAZORPAY_PAYMENT_PATTERN.test(providerPaymentId) ||
    !providerSignature ||
    !RAZORPAY_SIGNATURE_PATTERN.test(providerSignature)
  ) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_INVALID_RAZORPAY_PROOF',
      'Razorpay payment verification details are invalid.',
    );
  }

  return {providerOrderId, providerPaymentId, providerSignature};
}

export function parseSubscriptionPayment(value: unknown): SubscriptionPayment | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = parseUuid(raw.id);
  const invoiceId = parseUuid(raw.invoiceId);
  const subscriptionId = parseUuid(raw.subscriptionId);
  const cycleStart = parseDate(raw.cycleStart);
  const cycleEnd = parseDate(raw.cycleEnd);
  const currency = parseCurrency(raw.currency);
  const status = parseStatus(raw.status);
  const provider = parseProvider(raw.provider);
  const providerOrderId = optionalBoundedString(raw.providerOrderId, 500);
  const providerPaymentId = optionalBoundedString(raw.providerPaymentId, 500);
  const checkoutKeyId = optionalBoundedString(raw.checkoutKeyId, 500);
  const paymentSessionId = optionalBoundedString(raw.paymentSessionId, 5000);
  const providerStatus = optionalBoundedString(raw.providerStatus, 160);
  const createdAt = parseTimestamp(raw.createdAt);
  const updatedAt = parseTimestamp(raw.updatedAt);
  const paidAt = raw.paidAt === null || raw.paidAt === undefined
    ? null
    : parseTimestamp(raw.paidAt);

  const optionalFieldInvalid =
    (raw.providerOrderId != null && providerOrderId === null) ||
    (raw.providerPaymentId != null && providerPaymentId === null) ||
    (raw.checkoutKeyId != null && checkoutKeyId === null) ||
    (raw.paymentSessionId != null && paymentSessionId === null) ||
    (raw.providerStatus != null && providerStatus === null) ||
    (raw.paidAt != null && paidAt === null);

  if (
    !id ||
    !invoiceId ||
    !subscriptionId ||
    !cycleStart ||
    !cycleEnd ||
    cycleEnd <= cycleStart ||
    !currency ||
    !status ||
    !provider ||
    !createdAt ||
    !updatedAt ||
    optionalFieldInvalid ||
    (status === 'PAID' && !paidAt) ||
    (provider === 'RAZORPAY' &&
      status !== 'PAYMENT_REQUESTED' &&
      (!providerOrderId || !checkoutKeyId))
  ) {
    return null;
  }

  const amount = parseMoney(raw.amount, currency);
  if (!amount) return null;

  return {
    id,
    invoiceId,
    subscriptionId,
    cycleStart,
    cycleEnd,
    amount,
    status,
    provider,
    providerOrderId,
    providerPaymentId,
    checkoutKeyId,
    paymentSessionId,
    providerStatus,
    createdAt,
    updatedAt,
    paidAt,
  };
}

function requirePayment(value: unknown, scope: string): SubscriptionPayment {
  const payment = parseSubscriptionPayment(value);
  if (!payment) {
    throw new AppApiError(
      'SUBSCRIPTION_PAYMENT_INVALID_RESPONSE',
      `${scope} returned information that could not be verified. Please refresh and try again.`,
    );
  }
  return payment;
}

export const subscriptionPaymentApi = {
  async getLatestForSubscription(
    subscriptionId: string,
    signal?: AbortSignal,
  ): Promise<SubscriptionPayment> {
    requireUuid(subscriptionId, 'Subscription');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscription-payments/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        signal,
        dedupeKey: `subscription-payment:subscription:${subscriptionId}`,
      },
    );
    const payment = requirePayment(response, 'Subscription payment');
    if (payment.subscriptionId !== subscriptionId) {
      throw new AppApiError(
        'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
        'Subscription payment information did not match this subscription.',
      );
    }
    return payment;
  },

  async getInvoice(
    invoiceId: string,
    signal?: AbortSignal,
  ): Promise<SubscriptionPayment> {
    requireUuid(invoiceId, 'Invoice');
    const response = await httpClient.get<unknown>(
      `/api/v1/subscription-payments/invoices/${encodeURIComponent(invoiceId)}`,
      {
        signal,
        dedupeKey: `subscription-payment:invoice:${invoiceId}`,
      },
    );
    const payment = requirePayment(response, 'Subscription invoice');
    if (payment.invoiceId !== invoiceId) {
      throw new AppApiError(
        'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
        'Subscription invoice information did not match this invoice.',
      );
    }
    return payment;
  },

  async createOrder(
    invoiceId: string,
    request: CreateSubscriptionPaymentOrderRequest,
  ): Promise<SubscriptionPayment> {
    requireUuid(invoiceId, 'Invoice');
    const body = requireCreateOrderRequest(request);
    const response = await httpClient.post<unknown>(
      `/api/v1/subscription-payments/invoices/${encodeURIComponent(invoiceId)}/orders`,
      body,
    );
    const payment = requirePayment(response, 'Subscription payment order');
    if (payment.invoiceId !== invoiceId) {
      throw new AppApiError(
        'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
        'Subscription payment order did not match this invoice.',
      );
    }
    return payment;
  },

  async verifyRazorpay(
    invoiceId: string,
    request: VerifySubscriptionPaymentRequest,
  ): Promise<SubscriptionPayment> {
    requireUuid(invoiceId, 'Invoice');
    const body = requireVerificationRequest(request);
    const response = await httpClient.post<unknown>(
      `/api/v1/subscription-payments/invoices/${encodeURIComponent(invoiceId)}/verify`,
      body,
    );
    const payment = requirePayment(response, 'Subscription payment verification');
    if (payment.invoiceId !== invoiceId) {
      throw new AppApiError(
        'SUBSCRIPTION_PAYMENT_IDENTITY_MISMATCH',
        'Verified subscription payment did not match this invoice.',
      );
    }
    return payment;
  },
};
