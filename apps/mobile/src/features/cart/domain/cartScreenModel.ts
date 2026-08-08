import type {
  CartDependencies,
  CartDependencyStatus,
  CartLine,
  CartMoney,
  CartSnapshot,
} from './cartTypes';

export type CartScreenItem = CartLine;

export type CartScreenAmountSource =
  | 'CART_RESPONSE'
  | 'SERVER_CONTRACT_UNAVAILABLE';

export interface CartScreenAmountField {
  amount: CartMoney | null;
  source: CartScreenAmountSource;
}

export interface CartBillSummaryModel {
  foodSubtotal: CartScreenAmountField;
  platformFee: CartScreenAmountField;
  taxAmount: CartScreenAmountField;
  deliveryFee: CartScreenAmountField;
  couponDiscount: CartScreenAmountField;
  grandTotal: CartScreenAmountField;
  complete: boolean;
}

export interface CartDeliveryAddressSummaryModel {
  status: CartDependencyStatus;
  addressId: string | null;
  summary: string | null;
  summarySource: 'SERVER_CONTRACT_UNAVAILABLE';
}

export interface CartEtaSummaryModel {
  status: CartDependencyStatus;
  summary: string | null;
  summarySource: 'SERVER_CONTRACT_UNAVAILABLE';
}

export interface CartCouponSummaryModel {
  status: CartDependencyStatus;
  discount: CartScreenAmountField;
}

export type CartCheckoutEligibilityEvidence =
  | {kind: 'EXPLICIT_SERVER_ELIGIBLE'}
  | {kind: 'EXPLICIT_SERVER_INELIGIBLE'; reasonCode: string | null}
  | {kind: 'UNAVAILABLE'};

export interface CartCheckoutStateModel {
  enabled: boolean;
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'UNAVAILABLE';
  reasonCode: string | null;
}

export interface CartScreenModel {
  cartId: string;
  currency: string;
  items: CartScreenItem[];
  billSummary: CartBillSummaryModel;
  coupon: CartCouponSummaryModel;
  deliveryAddress: CartDeliveryAddressSummaryModel;
  eta: CartEtaSummaryModel;
  checkout: CartCheckoutStateModel;
}

export type CartQuantityInteraction =
  | {kind: 'UPDATE'; quantity: number}
  | {kind: 'REMOVE'}
  | {kind: 'INVALID'};

const unavailableAmount = (): CartScreenAmountField => ({
  amount: null,
  source: 'SERVER_CONTRACT_UNAVAILABLE',
});

export function resolveCartQuantityInteraction(
  targetQuantity: number,
): CartQuantityInteraction {
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) {
    return {kind: 'INVALID'};
  }

  if (targetQuantity === 0) {
    return {kind: 'REMOVE'};
  }

  return {kind: 'UPDATE', quantity: targetQuantity};
}

export function resolveCartCheckoutState(
  evidence: CartCheckoutEligibilityEvidence,
): CartCheckoutStateModel {
  if (evidence.kind === 'EXPLICIT_SERVER_ELIGIBLE') {
    return {enabled: true, status: 'ELIGIBLE', reasonCode: null};
  }

  if (evidence.kind === 'EXPLICIT_SERVER_INELIGIBLE') {
    return {
      enabled: false,
      status: 'INELIGIBLE',
      reasonCode: evidence.reasonCode,
    };
  }

  return {
    enabled: false,
    status: 'UNAVAILABLE',
    reasonCode: 'SERVER_ELIGIBILITY_UNAVAILABLE',
  };
}

export function buildCartScreenModel(
  snapshot: CartSnapshot,
  dependencies: CartDependencies,
  checkoutEvidence: CartCheckoutEligibilityEvidence = {kind: 'UNAVAILABLE'},
): CartScreenModel {
  return {
    cartId: snapshot.cartId,
    currency: snapshot.currency,
    items: snapshot.lines,
    billSummary: {
      foodSubtotal: {
        amount: snapshot.totals.foodSubtotal,
        source: 'CART_RESPONSE',
      },
      platformFee: unavailableAmount(),
      taxAmount: unavailableAmount(),
      deliveryFee: unavailableAmount(),
      couponDiscount: unavailableAmount(),
      grandTotal: unavailableAmount(),
      complete: false,
    },
    coupon: {
      status: dependencies.coupon.status,
      discount: unavailableAmount(),
    },
    deliveryAddress: {
      status: dependencies.address.status,
      addressId: dependencies.address.addressId,
      summary: null,
      summarySource: 'SERVER_CONTRACT_UNAVAILABLE',
    },
    eta: {
      status: dependencies.deliveryQuote.status,
      summary: null,
      summarySource: 'SERVER_CONTRACT_UNAVAILABLE',
    },
    checkout: resolveCartCheckoutState(checkoutEvidence),
  };
}
