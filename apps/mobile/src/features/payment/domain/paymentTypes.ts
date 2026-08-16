export type PaymentOrderStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export type PaymentProvider = 'CASHFREE' | 'RAZORPAY';

export interface PaymentMoney {
  amount: string;
  currency: string;
}

export interface PaymentOrderHandoffSession {
  paymentOrderId: string;
  checkoutId: string;
  cravesPaymentOrderRef: string;
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string | null;
  checkoutKeyId: string | null;
  paymentSessionId: string | null;
  amount: PaymentMoney;
  status: PaymentOrderStatus;
  createdAt: string;
}

export interface PaymentOrderSnapshot {
  paymentOrderId: string;
  checkoutId: string;
  customerIdentityId: string;
  cravesPaymentOrderRef: string;
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: PaymentMoney;
  status: PaymentOrderStatus;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentVerificationResult {
  paymentOrderId: string;
  status: PaymentOrderStatus;
  providerStatus: string | null;
  providerPaymentId: string | null;
}

export interface RazorpayVerificationProof {
  providerOrderId: string;
  providerPaymentId: string;
  providerSignature: string;
}

/**
 * The minimum non-secret data needed to reconcile an interrupted payment.
 * This is safe to persist locally because it contains only Craves/provider
 * identifiers and the public amount/currency already shown at checkout.
 */
export interface PaymentRecoveryReference {
  paymentOrderId: string;
  checkoutId: string;
  providerOrderId: string;
  amount: PaymentMoney;
}

export interface RazorpayHostedHandoff extends PaymentRecoveryReference {
  provider: 'RAZORPAY';
  checkoutKeyId: string;
}
