import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import type {
  PaymentMoney,
  PaymentOrderHandoffSession,
  PaymentOrderSnapshot,
  PaymentOrderStatus,
  PaymentProvider,
  PaymentVerificationResult,
  RazorpayVerificationProof,
} from '../domain/paymentTypes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const PAYMENT_STATUSES = new Set<PaymentOrderStatus>([
  'CREATED',
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
  if (value === undefined || value === null) return null;
  return boundedString(value, maxLength);
}

function parseUuid(value: unknown): string | null {
  const candidate = boundedString(value, 64);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function parseCurrency(value: unknown): string | null {
  const candidate = boundedString(value, 3);
  return candidate && CURRENCY_PATTERN.test(candidate) ? candidate : null;
}

function parseDecimal(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    const normalized = String(value);
    return DECIMAL_PATTERN.test(normalized) ? normalized : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
}

function parseMoney(value: unknown, currency: string): PaymentMoney | null {
  const amount = parseDecimal(value);
  return amount ? {amount, currency} : null;
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseStatus(value: unknown): PaymentOrderStatus | null {
  return typeof value === 'string' && PAYMENT_STATUSES.has(value as PaymentOrderStatus)
    ? (value as PaymentOrderStatus)
    : null;
}

function parseProvider(value: unknown): PaymentProvider | null {
  return typeof value === 'string' && PAYMENT_PROVIDERS.has(value as PaymentProvider)
    ? (value as PaymentProvider)
    : null;
}

function requireUuid(value: string, code: string, message: string): void {
  if (!UUID_PATTERN.test(value)) throw new AppApiError(code, message);
}

function isProviderSessionReady(
  provider: PaymentProvider,
  checkoutKeyId: string | null,
  paymentSessionId: string | null,
): boolean {
  if (provider === 'RAZORPAY') return checkoutKeyId !== null;
  return paymentSessionId !== null;
}

export function parsePaymentOrderHandoffSession(
  value: unknown,
): PaymentOrderHandoffSession | null {
  const order = asRecord(value);
  if (!order) return null;

  const paymentOrderId = parseUuid(order.paymentOrderId);
  const checkoutId = parseUuid(order.checkoutId);
  const cravesPaymentOrderRef = boundedString(order.cravesPaymentOrderRef, 160);
  const provider = parseProvider(order.provider);
  const providerOrderId = boundedString(order.providerOrderId, 180);
  const providerPaymentId = optionalBoundedString(order.providerPaymentId, 180);
  const checkoutKeyId = optionalBoundedString(order.checkoutKeyId, 180);
  const paymentSessionId = optionalBoundedString(order.paymentSessionId, 5000);
  const currency = parseCurrency(order.currency);
  const status = parseStatus(order.status);
  const createdAt = parseTimestamp(order.createdAt);

  const providerPaymentIdWasInvalid =
    order.providerPaymentId !== undefined &&
    order.providerPaymentId !== null &&
    providerPaymentId === null;
  const checkoutKeyIdWasInvalid =
    order.checkoutKeyId !== undefined &&
    order.checkoutKeyId !== null &&
    checkoutKeyId === null;
  const paymentSessionIdWasInvalid =
    order.paymentSessionId !== undefined &&
    order.paymentSessionId !== null &&
    paymentSessionId === null;

  if (
    !paymentOrderId ||
    !checkoutId ||
    !cravesPaymentOrderRef ||
    !provider ||
    !providerOrderId ||
    !currency ||
    !status ||
    !createdAt ||
    providerPaymentIdWasInvalid ||
    checkoutKeyIdWasInvalid ||
    paymentSessionIdWasInvalid ||
    !isProviderSessionReady(provider, checkoutKeyId, paymentSessionId)
  ) {
    return null;
  }

  const amount = parseMoney(order.amount, currency);
  if (!amount) return null;

  return {
    paymentOrderId,
    checkoutId,
    cravesPaymentOrderRef,
    provider,
    providerOrderId,
    providerPaymentId,
    checkoutKeyId,
    paymentSessionId,
    amount,
    status,
    createdAt,
  };
}

export function parsePaymentOrderSnapshot(value: unknown): PaymentOrderSnapshot | null {
  const order = asRecord(value);
  if (!order) return null;

  const paymentOrderId = parseUuid(order.paymentOrderId);
  const checkoutId = parseUuid(order.checkoutId);
  const customerIdentityId = parseUuid(order.customerIdentityId);
  const cravesPaymentOrderRef = boundedString(order.cravesPaymentOrderRef, 160);
  const provider = parseProvider(order.provider);
  const providerOrderId = boundedString(order.providerOrderId, 180);
  const providerPaymentId = optionalBoundedString(order.providerPaymentId, 180);
  const currency = parseCurrency(order.currency);
  const status = parseStatus(order.status);
  const providerStatus = optionalBoundedString(order.providerStatus, 160);
  const createdAt = parseTimestamp(order.createdAt);
  const updatedAt = parseTimestamp(order.updatedAt);

  const providerPaymentIdWasInvalid =
    order.providerPaymentId !== undefined &&
    order.providerPaymentId !== null &&
    providerPaymentId === null;
  const providerStatusWasInvalid =
    order.providerStatus !== undefined && order.providerStatus !== null && providerStatus === null;

  if (
    !paymentOrderId ||
    !checkoutId ||
    !customerIdentityId ||
    !cravesPaymentOrderRef ||
    !provider ||
    !providerOrderId ||
    !currency ||
    !status ||
    !createdAt ||
    !updatedAt ||
    providerPaymentIdWasInvalid ||
    providerStatusWasInvalid
  ) {
    return null;
  }

  const amount = parseMoney(order.amount, currency);
  if (!amount) return null;

  return {
    paymentOrderId,
    checkoutId,
    customerIdentityId,
    cravesPaymentOrderRef,
    provider,
    providerOrderId,
    providerPaymentId,
    amount,
    status,
    providerStatus,
    createdAt,
    updatedAt,
  };
}

export function parsePaymentVerificationResult(
  value: unknown,
): PaymentVerificationResult | null {
  const result = asRecord(value);
  if (!result) return null;

  const paymentOrderId = parseUuid(result.paymentOrderId);
  const status = parseStatus(result.status);
  const providerStatus = optionalBoundedString(result.providerStatus, 160);
  const providerPaymentId = optionalBoundedString(result.providerPaymentId, 180);
  const providerStatusWasInvalid =
    result.providerStatus !== undefined &&
    result.providerStatus !== null &&
    providerStatus === null;
  const providerPaymentIdWasInvalid =
    result.providerPaymentId !== undefined &&
    result.providerPaymentId !== null &&
    providerPaymentId === null;

  if (!paymentOrderId || !status || providerStatusWasInvalid || providerPaymentIdWasInvalid) {
    return null;
  }

  return {paymentOrderId, status, providerStatus, providerPaymentId};
}

function requireHandoffSession(value: unknown): PaymentOrderHandoffSession {
  const session = parsePaymentOrderHandoffSession(value);
  if (!session) {
    throw new AppApiError(
      'PAYMENT_ORDER_INVALID_RESPONSE',
      'Payment information could not be verified. Please refresh before trying again.',
    );
  }
  return session;
}

function requireSnapshot(value: unknown): PaymentOrderSnapshot {
  const snapshot = parsePaymentOrderSnapshot(value);
  if (!snapshot) {
    throw new AppApiError(
      'PAYMENT_ORDER_INVALID_RESPONSE',
      'Payment information could not be verified. Please refresh before trying again.',
    );
  }
  return snapshot;
}

function requireVerificationResult(value: unknown): PaymentVerificationResult {
  const result = parsePaymentVerificationResult(value);
  if (!result) {
    throw new AppApiError(
      'PAYMENT_VERIFICATION_INVALID_RESPONSE',
      'Payment status could not be verified. Please try again.',
    );
  }
  return result;
}

function requireVerificationProof(proof: RazorpayVerificationProof): void {
  for (const [field, value, max] of [
    ['providerOrderId', proof.providerOrderId, 180],
    ['providerPaymentId', proof.providerPaymentId, 180],
    ['providerSignature', proof.providerSignature, 512],
  ] as const) {
    if (!value.trim() || value.trim().length > max) {
      throw new AppApiError(
        'PAYMENT_PROVIDER_PROOF_INVALID',
        `Payment provider ${field} could not be verified.`,
      );
    }
  }
}

export const paymentApi = {
  async createOrder(checkoutId: string): Promise<PaymentOrderHandoffSession> {
    requireUuid(
      checkoutId,
      'PAYMENT_INVALID_CHECKOUT_ID',
      'This checkout cannot be used for payment.',
    );
    const response = await httpClient.post<unknown>('/api/v1/payments/orders', {checkoutId});
    const session = requireHandoffSession(response);
    if (session.checkoutId !== checkoutId) {
      throw new AppApiError(
        'PAYMENT_CHECKOUT_MISMATCH',
        'Payment information belongs to a different checkout. Please refresh and try again.',
      );
    }
    return session;
  },

  async getOrder(paymentOrderId: string): Promise<PaymentOrderSnapshot> {
    requireUuid(
      paymentOrderId,
      'PAYMENT_INVALID_ORDER_ID',
      'This payment could not be opened.',
    );
    const response = await httpClient.get<unknown>(
      `/api/v1/payments/orders/${paymentOrderId}`,
      {dedupeKey: `customer-payment-order:${paymentOrderId}`},
    );
    const snapshot = requireSnapshot(response);
    if (snapshot.paymentOrderId !== paymentOrderId) {
      throw new AppApiError(
        'PAYMENT_ORDER_ID_MISMATCH',
        'Payment information could not be verified. Please refresh and try again.',
      );
    }
    return snapshot;
  },

  async verifyOrder(
    paymentOrderId: string,
    proof: RazorpayVerificationProof,
  ): Promise<PaymentVerificationResult> {
    requireUuid(
      paymentOrderId,
      'PAYMENT_INVALID_ORDER_ID',
      'This payment could not be verified.',
    );
    requireVerificationProof(proof);
    const response = await httpClient.post<unknown>(
      `/api/v1/payments/orders/${paymentOrderId}/verify`,
      proof,
    );
    const result = requireVerificationResult(response);
    if (result.paymentOrderId !== paymentOrderId) {
      throw new AppApiError(
        'PAYMENT_VERIFICATION_ID_MISMATCH',
        'Payment status belongs to a different payment. Please refresh and try again.',
      );
    }
    return result;
  },
};
