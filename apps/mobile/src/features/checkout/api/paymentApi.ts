import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';

export interface MobilePaymentSession {
  paymentOrderId: string;
  checkoutId: string;
  cashfreeOrderId: string;
  paymentSessionId: string;
  status: 'CREATED' | 'PAYMENT_PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
}

export interface MobilePaymentVerification {
  paymentOrderId: string;
  status: MobilePaymentSession['status'];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_STATUSES = new Set<MobilePaymentSession['status']>([
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function uuid(value: unknown): string | null {
  const candidate = text(value, 64);
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

function parsePaymentSession(value: unknown): MobilePaymentSession | null {
  const raw = record(value);
  if (!raw) return null;
  const paymentOrderId = uuid(raw.paymentOrderId);
  const checkoutId = uuid(raw.checkoutId);
  const cashfreeOrderId = text(raw.cashfreeOrderId, 180);
  const paymentSessionId = text(raw.paymentSessionId, 5000);
  const status = text(raw.status, 30) as MobilePaymentSession['status'] | null;
  if (
    !paymentOrderId ||
    !checkoutId ||
    !cashfreeOrderId ||
    !paymentSessionId ||
    !status ||
    !PAYMENT_STATUSES.has(status)
  ) return null;
  return {paymentOrderId, checkoutId, cashfreeOrderId, paymentSessionId, status};
}

function parseVerification(value: unknown): MobilePaymentVerification | null {
  const raw = record(value);
  if (!raw) return null;
  const paymentOrderId = uuid(raw.paymentOrderId);
  const status = text(raw.status, 30) as MobilePaymentSession['status'] | null;
  return paymentOrderId && status && PAYMENT_STATUSES.has(status)
    ? {paymentOrderId, status}
    : null;
}

export const paymentApi = {
  async createSession(checkoutId: string, customerPhone?: string | null): Promise<MobilePaymentSession> {
    if (!UUID_PATTERN.test(checkoutId)) {
      throw new AppApiError('PAYMENT_INVALID_CHECKOUT_ID', 'This checkout could not be paid.');
    }
    const response = await httpClient.post<unknown>('/api/v1/payments/orders', {
      checkoutId,
      customerName: 'Craves Customer',
      customerEmail: null,
      customerPhone: customerPhone ?? null,
      returnUrl: null,
    });
    const payment = parsePaymentSession(response);
    if (!payment || payment.checkoutId !== checkoutId) {
      throw new AppApiError('PAYMENT_INVALID_RESPONSE', 'Cashfree payment session could not be verified.');
    }
    return payment;
  },

  async verify(paymentOrderId: string): Promise<MobilePaymentVerification> {
    if (!UUID_PATTERN.test(paymentOrderId)) {
      throw new AppApiError('PAYMENT_INVALID_ORDER_ID', 'This payment could not be verified.');
    }
    const response = await httpClient.post<unknown>(
      `/api/v1/payments/orders/${paymentOrderId}/verify`,
      {},
    );
    const verification = parseVerification(response);
    if (!verification || verification.paymentOrderId !== paymentOrderId) {
      throw new AppApiError('PAYMENT_INVALID_RESPONSE', 'Payment verification could not be completed.');
    }
    return verification;
  },
};