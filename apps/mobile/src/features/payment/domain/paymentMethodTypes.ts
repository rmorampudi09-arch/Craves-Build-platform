export const PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE =
  'CUSTOMER_PAYMENT_METHOD_LIST_CONTRACT_UNAVAILABLE' as const;
export const PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE =
  'CUSTOMER_PAYMENT_ELIGIBILITY_CONTRACT_UNAVAILABLE' as const;
export const COD_ELIGIBILITY_CONTRACT_UNAVAILABLE =
  'CUSTOMER_COD_ELIGIBILITY_CONTRACT_UNAVAILABLE' as const;

export type CustomerPaymentMethodId = 'CASHFREE_ONLINE' | 'COD';

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
 * P68 renders the reference capability groups without fabricating token rows or
 * eligibility. The branch has a verified Cashfree payment-order handoff, but no
 * customer payment-method list or cart-scoped payment-eligibility contract.
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
      ? 'Payment options are shown from the approved product capability set. Selection stays disabled until current cart/provider eligibility can be verified.'
      : 'View payment capabilities without creating a checkout selection. Saved tokenized methods require the approved payment-method contract.',
    savedMethodsSupported: false,
    selectedMethodId: null,
    options: [
      {
        id: 'CASHFREE_ONLINE',
        title: 'Online payment methods',
        description:
          'Cards, UPI, wallets and net banking are handled through the secure provider flow when an eligible checkout is available.',
        availability: 'BLOCKED',
        blockerReason: activeCart
          ? 'Current cart/provider payment eligibility is not exposed by the approved mobile API contract yet.'
          : 'Add items to a cart first; live provider eligibility still requires the approved payment eligibility contract.',
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
