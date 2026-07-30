import { CRAVES_API_BASE_URL, NETWORK_TIMEOUT_MS } from '../config';
import type { MobileSession } from '../auth/contracts';
import { parseCheckout, parsePaymentSession, parsePaymentVerification, validCheckoutInput, type MobileCheckout, type MobilePaymentSession, type MobilePaymentVerification } from './contracts';

export class CheckoutApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

type Method = 'GET' | 'POST';

async function request(session: MobileSession, path: string, method: Method = 'GET', body?: unknown, timeoutMs = NETWORK_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${CRAVES_API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    if (response.status === 401) throw new CheckoutApiError('SESSION_EXPIRED', 401, 'Your session expired. Sign in again.');
    if (response.status === 404) throw new CheckoutApiError('NOT_FOUND', 404, 'The checkout or payment was not found.');
    if (!response.ok) throw new CheckoutApiError('CHECKOUT_REQUEST_FAILED', response.status, 'Checkout or payment could not be completed.');
    return response;
  } catch (error) {
    if (error instanceof CheckoutApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new CheckoutApiError('CHECKOUT_TIMEOUT', 504, 'The request timed out.');
    throw new CheckoutApiError('CHECKOUT_UNAVAILABLE', 503, 'Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}

export async function createCheckout(session: MobileSession, deliveryAddressId: string, note: string): Promise<MobileCheckout> {
  if (!validCheckoutInput(deliveryAddressId, note)) throw new CheckoutApiError('INVALID_CHECKOUT', 400, 'Choose a valid saved address and keep the note within 500 characters.');
  const response = await request(session, '/checkout', 'POST', { deliveryAddressId, note: note.trim() || null }, 15_000);
  const checkout = parseCheckout(await response.json().catch(() => null));
  if (!checkout) throw new CheckoutApiError('INVALID_CHECKOUT_RESPONSE', 502, 'Checkout is temporarily unavailable.');
  return checkout;
}

export async function getCheckout(session: MobileSession, checkoutId: string): Promise<MobileCheckout> {
  assertUuid(checkoutId, 'INVALID_CHECKOUT_ID');
  const response = await request(session, `/checkout/${encodeURIComponent(checkoutId)}`);
  const checkout = parseCheckout(await response.json().catch(() => null));
  if (!checkout) throw new CheckoutApiError('INVALID_CHECKOUT_RESPONSE', 502, 'Checkout is temporarily unavailable.');
  return checkout;
}

export async function createPaymentSession(session: MobileSession, checkoutId: string): Promise<MobilePaymentSession> {
  assertUuid(checkoutId, 'INVALID_CHECKOUT_ID');
  const response = await request(session, '/payments/orders', 'POST', {
    checkoutId,
    customerName: session.identity.displayName ?? 'Craves Customer',
    customerEmail: null,
    customerPhone: session.identity.phoneNumber,
    returnUrl: null
  }, 20_000);
  const payment = parsePaymentSession(await response.json().catch(() => null));
  if (!payment || payment.checkoutId !== checkoutId) throw new CheckoutApiError('INVALID_PAYMENT_RESPONSE', 502, 'Payment session is temporarily unavailable.');
  return payment;
}

export async function verifyPayment(session: MobileSession, paymentOrderId: string): Promise<MobilePaymentVerification> {
  assertUuid(paymentOrderId, 'INVALID_PAYMENT_ORDER_ID');
  const response = await request(session, `/payments/orders/${encodeURIComponent(paymentOrderId)}/verify`, 'POST', undefined, 20_000);
  const verification = parsePaymentVerification(await response.json().catch(() => null));
  if (!verification || verification.paymentOrderId !== paymentOrderId) throw new CheckoutApiError('INVALID_PAYMENT_RESPONSE', 502, 'Payment verification is temporarily unavailable.');
  return verification;
}

function assertUuid(value: string, code: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new CheckoutApiError(code, 400, 'Identifier is invalid.');
}
