import type {
  PaymentMoney,
  PaymentProvider,
  RazorpayVerificationProof,
} from '../../payment/domain/paymentTypes';

export type SubscriptionPaymentStatus =
  | 'PAYMENT_REQUESTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface SubscriptionPayment {
  id: string;
  invoiceId: string;
  subscriptionId: string;
  cycleStart: string;
  cycleEnd: string;
  amount: PaymentMoney;
  status: SubscriptionPaymentStatus;
  provider: PaymentProvider;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  checkoutKeyId: string | null;
  paymentSessionId: string | null;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

export interface CreateSubscriptionPaymentOrderRequest {
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  returnUrl?: string | null;
}

export type VerifySubscriptionPaymentRequest = RazorpayVerificationProof;
