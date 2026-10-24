export const PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE =
  'CUSTOMER_PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE' as const;
export const PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE =
  'CUSTOMER_PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE' as const;
export const COD_ELIGIBILITY_CONTRACT_UNAVAILABLE =
  'CUSTOMER_COD_ELIGIBILITY_CONTRACT_UNAVAILABLE' as const;

export type CustomerPaymentMethodId = 'RAZORPAY_ONLINE' | 'COD';

export type CustomerPaymentMethodsMode = 'EMPTY_CART' | 'ACTIVE_CART';

export type CustomerPaymentMethodAvailability = 'AVAILABLE' | 'BLOCKED';

export interface CustomerPaymentMethodOption {
  id: CustomerPaymentMethodId;
  title: string;
  description: string;
  availability: CustomerPaymentMethodAvailability;
  blockerReason: string | null;
  channels: readonly string[];
  selected: boolean;
}

export interface CustomerPaymentMethodsScreenModel {
  mode: CustomerPaymentMethodsMode;
  title: string;
  subtitle: string;
  savedMethodsSupported: false;
  selectedMethodId: CustomerPaymentMethodId | null;
  options: readonly CustomerPaymentMethodOption[];
}

export interface BuildCustomerPaymentMethodsModelInput {
  cartItemCount: number;
  selectedMethodId: CustomerPaymentMethodId | null;
}

/**
 * The standalone Payment Methods screen remains informational until Craves
 * exposes a cart-scoped payment-method eligibility/list contract. Actual cart
 * checkout uses the backend-issued Razorpay order and never stores raw payment
 * credentials in the app.
 */
export function buildCustomerPaymentMethodsModel({
  cartItemCount,
}: BuildCustomerPaymentMethodsModelInput): CustomerPaymentMethodsScreenModel {
  const activeCart = cartItemCount > 0;
  const mode: CustomerPaymentMethodsMode = activeCart ? 'ACTIVE_CART' : 'EMPTY_CART';

  return {
    mode,
    title: activeCart ? 'Choose how you’ll pay' : 'Payment methods',
    subtitle: activeCart
      ? 'You pay online through Razorpay when you check out from your cart.'
      : 'How you can pay for your Craves orders.',
    savedMethodsSupported: false,
    selectedMethodId: null,
    options: [
      {
        id: 'RAZORPAY_ONLINE',
        title: 'Online payment methods',
        description:
          'Pay with cards, UPI, wallets or net banking through Razorpay at checkout.',
        availability: 'BLOCKED',
        blockerReason: activeCart
          ? 'Continue from your cart and tap Checkout to pay.'
          : 'Add dishes to your cart first, then pay at checkout.',
        channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
        selected: false,
      },
      {
        id: 'COD',
        title: 'Cash on delivery',
        description: 'Pay in cash when your food arrives.',
        availability: 'BLOCKED',
        blockerReason:
          'Cash on delivery is not offered yet.',
        channels: ['COD'],
        selected: false,
      },
    ],
  };
}
