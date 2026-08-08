export type PaymentOrderStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';

export interface PaymentMoney {
  amount: string;
  currency: string;
}

export interface PaymentOrderHandoffSession {
  paymentOrderId: string;
  checkoutId: string;
  cravesPaymentOrderRef: string;
  cashfreeOrderId: string;
  cfOrderId: string;
  paymentSessionId: string;
  amount: PaymentMoney;
  status: PaymentOrderStatus;
  createdAt: string;
}

export interface PaymentOrderSnapshot {
  paymentOrderId: string;
  checkoutId: string;
  customerIdentityId: string;
  cravesPaymentOrderRef: string;
  cashfreeOrderId: string;
  cfOrderId: string;
  amount: PaymentMoney;
  status: PaymentOrderStatus;
  providerStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashfreeHostedHandoff {
  provider: 'CASHFREE';
  paymentOrderId: string;
  checkoutId: string;
  cashfreeOrderId: string;
  paymentSessionId: string;
  amount: PaymentMoney;
}
