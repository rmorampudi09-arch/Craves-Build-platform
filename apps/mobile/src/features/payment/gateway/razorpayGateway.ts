import {AppApiError} from '../../../core/http/apiError';
import type {
  RazorpayHostedHandoff,
  RazorpayVerificationProof,
} from '../domain/paymentTypes';
import type {RazorpayCheckoutOptions} from 'react-native-razorpay';

const MAX_PROVIDER_FIELD_LENGTH = 512;

declare const require: (id: string) => unknown;

export interface RazorpayCustomerPrefill {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function amountInSubunits(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) {
    throw new AppApiError(
      'PAYMENT_AMOUNT_INVALID',
      'The payment amount could not be prepared securely.',
    );
  }
  const [, whole, fractional = ''] = match;
  const subunits = Number(`${whole}${fractional.padEnd(2, '0')}`);
  if (!Number.isSafeInteger(subunits) || subunits <= 0) {
    throw new AppApiError(
      'PAYMENT_AMOUNT_INVALID',
      'The payment amount could not be prepared securely.',
    );
  }
  return subunits;
}

function parseProviderProof(
  value: unknown,
  expectedProviderOrderId: string,
): RazorpayVerificationProof {
  const result = asRecord(value);
  const providerPaymentId = boundedText(
    result?.razorpay_payment_id,
    MAX_PROVIDER_FIELD_LENGTH,
  );
  const providerOrderId = boundedText(
    result?.razorpay_order_id,
    MAX_PROVIDER_FIELD_LENGTH,
  );
  const providerSignature = boundedText(
    result?.razorpay_signature,
    MAX_PROVIDER_FIELD_LENGTH,
  );

  if (!providerPaymentId || !providerOrderId || !providerSignature) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_RESPONSE_INVALID',
      'Razorpay returned an incomplete payment response. Payment was not accepted.',
    );
  }
  if (providerOrderId !== expectedProviderOrderId) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_ORDER_MISMATCH',
      'Razorpay returned a response for a different payment. Payment was not accepted.',
    );
  }

  return {providerOrderId, providerPaymentId, providerSignature};
}

function providerFailureMessage(error: unknown): string {
  const record = asRecord(error);
  const description = boundedText(record?.description, 180);
  if (description) return description;
  return 'Razorpay checkout did not complete. No payment has been marked successful.';
}

async function nativeRazorpayOpen(): Promise<
  | ((options: RazorpayCheckoutOptions) => Promise<unknown>)
  | null
> {
  let module: {default?: unknown; open?: unknown} | null;
  try {
    module = require('react-native-razorpay') as {
      default?: unknown;
      open?: unknown;
    };
  } catch {
    return null;
  }
  const checkout = (asRecord(module.default) ?? asRecord(module)) as {
    open?: unknown;
  } | null;
  return typeof checkout?.open === 'function'
    ? (checkout.open.bind(checkout) as (
        options: RazorpayCheckoutOptions,
      ) => Promise<unknown>)
    : null;
}

export async function openRazorpayCheckout(
  handoff: RazorpayHostedHandoff,
  prefill: RazorpayCustomerPrefill = {},
): Promise<RazorpayVerificationProof> {
  const prefillName = boundedText(prefill.name, 120) ?? 'Craves Customer';
  const prefillEmail = boundedText(prefill.email, 180);
  const prefillPhone = boundedText(prefill.phone, 32);
  const amount = amountInSubunits(handoff.amount.amount);
  const openNativeCheckout = await nativeRazorpayOpen();

  if (!openNativeCheckout) {
    throw new AppApiError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'Secure payment checkout is not available in this mobile build.',
      undefined,
      undefined,
      true,
    );
  }

  try {
    const response = await openNativeCheckout({
      key: handoff.checkoutKeyId,
      amount,
      currency: handoff.amount.currency,
      name: 'Craves',
      description: 'Craves order payment',
      order_id: handoff.providerOrderId,
      prefill: {
        name: prefillName,
        ...(prefillEmail ? {email: prefillEmail} : {}),
        ...(prefillPhone ? {contact: prefillPhone} : {}),
      },
      retry: {enabled: true, max_count: 4},
      theme: {color: '#F62E18'},
    });
    return parseProviderProof(response, handoff.providerOrderId);
  } catch (error) {
    if (error instanceof AppApiError) throw error;
    throw new AppApiError(
      'PAYMENT_PROVIDER_FAILED',
      providerFailureMessage(error),
      undefined,
      undefined,
      true,
    );
  }
}

export const razorpayGateway = {open: openRazorpayCheckout};
