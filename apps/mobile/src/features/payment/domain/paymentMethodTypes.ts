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
 * P68 intentionally separates provider capability from saved-token support.
 * The current authoritative runtime can hand off a checkout to Cashfree, but it
 * exposes no customer token CRUD contract and no COD eligibility endpoint.
 */
export function buildCustomerPaymentMethodsModel({
  cartItemCount,
  selectedMethodId,
}: BuildCustomerPaymentMethodsModelInput): CustomerPaymentMethodsScreenModel {
  const activeCart = cartItemCount > 0;
  const mode: CustomerPaymentMethodsMode = activeCart ? 'ACTIVE_CART' : 'EMPTY_CART';
  const onlineAvailable = activeCart;

  return {
    mode,
    title: activeCart ? 'Choose how you’ll pay' : 'Payment methods',
    subtitle: activeCart
      ? 'Choose a payment route for this cart. Final provider availability is confirmed at the secure payment step.'
      : 'Saved payment methods are not exposed by the current mobile contract. Add items to a cart to choose a payment route.',
    savedMethodsSupported: false,
    selectedMethodId: activeCart ? selectedMethodId : null,
    options: [
      {
        id: 'CASHFREE_ONLINE',
        title: 'Pay online securely',
        description: activeCart
          ? 'Continue to the Cashfree secure payment step after checkout review.'
          : 'Available when you have items in your cart.',
        availability: onlineAvailable ? 'AVAILABLE' : 'BLOCKED',
        blockerReason: onlineAvailable ? null : 'Add items to your cart to use online payment.',
        channels: ['Cards', 'UPI', 'Wallets', 'Net banking'],
        selected: onlineAvailable && selectedMethodId === 'CASHFREE_ONLINE',
      },
      {
        id: 'COD',
        title: 'Cash on delivery',
        description: 'Availability must be verified for the current cart and delivery context.',
        availability: 'BLOCKED',
        blockerReason:
          'Cash on delivery eligibility is not exposed by the approved mobile API contract yet.',
        channels: ['COD'],
        selected: false,
      },
    ],
  };
}
