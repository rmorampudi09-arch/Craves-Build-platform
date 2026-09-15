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
      ? 'Online checkout is securely handled by Razorpay from Cart. Saved-method selection stays disabled until Craves exposes an authoritative payment-method eligibility contract.'
      : 'View payment capabilities without creating a checkout selection. Saved tokenized methods require the approved payment-method contract.',
    savedMethodsSupported: false,
    selectedMethodId: null,
    options: [
      {
        id: 'RAZORPAY_ONLINE',
        title: 'Online payment methods',
        description:
          'Cards, UPI, wallets and net banking are handled through Razorpay after Craves creates and validates the checkout.',
        availability: 'BLOCKED',
        blockerReason: activeCart
          ? 'Continue from Cart to launch the backend-issued Razorpay payment order. This screen does not invent a separate selection contract.'
          : 'Add items to a cart first; checkout creates the authoritative payment order.',
        channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
        selected: false,
      },
      {
        id: 'COD',
        title: 'Cash on delivery',
        description: 'Availability must be verified for the current cart, address and order intent.',
        availability: 'BLOCKED',
        blockerReason:
          'Cash on delivery eligibility is not exposed by the approved mobile API contract yet.',
        channels: ['COD'],
        selected: false,
      },
    ],
  };
}
