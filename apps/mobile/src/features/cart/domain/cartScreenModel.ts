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
  | 'PENDING_BACKEND_IMPLEMENTATION';

export interface CartScreenAmountField {
  amount: CartMoney | null;
  source: CartScreenAmountSource;
}

export interface CartBillSummaryModel {
  foodSubtotal: CartScreenAmountField;
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
  summarySource: 'CUSTOMER_LOCATION';
}

export interface CartEtaSummaryModel {
  status: CartDependencyStatus;
  summary: string | null;
  summarySource: 'SERVICEABILITY_CHECK';
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

function zeroAmount(currency: string): CartScreenAmountField {
  return {
    amount: {amount: '0', currency},
    source: 'PENDING_BACKEND_IMPLEMENTATION',
  };
}

export function resolveCartQuantityInteraction(targetQuantity: number): CartQuantityInteraction {
  if (!Number.isSafeInteger(targetQuantity) || targetQuantity < 0) return {kind: 'INVALID'};
  if (targetQuantity === 0) return {kind: 'REMOVE'};
  return {kind: 'UPDATE', quantity: targetQuantity};
}

export function resolveCartCheckoutState(
  evidence: CartCheckoutEligibilityEvidence,
): CartCheckoutStateModel {
  if (evidence.kind === 'EXPLICIT_SERVER_ELIGIBLE') {
    return {enabled: true, status: 'ELIGIBLE', reasonCode: null};
  }
  if (evidence.kind === 'EXPLICIT_SERVER_INELIGIBLE') {
    return {enabled: false, status: 'INELIGIBLE', reasonCode: evidence.reasonCode};
  }
  return {enabled: false, status: 'UNAVAILABLE', reasonCode: 'SERVER_ELIGIBILITY_UNAVAILABLE'};
}

export function buildCartScreenModel(
  snapshot: CartSnapshot,
  dependencies: CartDependencies,
  checkoutEvidence?: CartCheckoutEligibilityEvidence,
): CartScreenModel {
  const addressReady = dependencies.address.status === 'CURRENT' && Boolean(dependencies.address.addressId);
  const evidence = checkoutEvidence ?? (addressReady
    ? {kind: 'EXPLICIT_SERVER_ELIGIBLE'}
    : {kind: 'UNAVAILABLE'}) as CartCheckoutEligibilityEvidence;

  return {
    cartId: snapshot.cartId,
    currency: snapshot.currency,
    items: snapshot.lines,
    billSummary: {
      foodSubtotal: {amount: snapshot.totals.foodSubtotal, source: 'CART_RESPONSE'},
      taxAmount: zeroAmount(snapshot.currency),
      deliveryFee: zeroAmount(snapshot.currency),
      couponDiscount: zeroAmount(snapshot.currency),
      grandTotal: {amount: snapshot.totals.foodSubtotal, source: 'CART_RESPONSE'},
      complete: true,
    },
    coupon: {
      status: dependencies.coupon.status,
      discount: zeroAmount(snapshot.currency),
    },
    deliveryAddress: {
      status: dependencies.address.status,
      addressId: dependencies.address.addressId,
      summary: null,
      summarySource: 'CUSTOMER_LOCATION',
    },
    eta: {
      status: dependencies.deliveryQuote.status,
      summary: null,
      summarySource: 'SERVICEABILITY_CHECK',
    },
    checkout: resolveCartCheckoutState(evidence),
  };
}