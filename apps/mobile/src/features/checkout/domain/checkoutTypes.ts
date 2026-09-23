export type CheckoutStatus = 'PAYMENT_PENDING' | 'PAID' | 'CANCELLED';

export type CheckoutOrderStatus =
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CHEF_ACCEPTANCE_PENDING'
  | 'CHEF_ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CHEF_REJECTED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED';

export interface CheckoutMoney {
  amount: string;
  currency: string;
}

export interface CheckoutDeliveryAddressSnapshot {
  sourceAddressId: string;
  recipientName: string | null;
  contactPhoneNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CheckoutOrderReference {
  orderId: string;
  checkoutId: string;
  status: CheckoutOrderStatus;
}

export interface CheckoutSession {
  checkoutId: string;
  customerIdentityId: string;
  status: CheckoutStatus;
  currency: string;
  foodSubtotal: CheckoutMoney;
  platformFee: CheckoutMoney;
  taxAmount: CheckoutMoney;
  deliveryFee: CheckoutMoney;
  grandTotal: CheckoutMoney;
  chargePolicyId: string;
  deliveryAddressId: string;
  /**
   * Authoritative checkout-time address snapshot returned by the order service.
   * Optional for compatibility with older persisted checkouts created before the
   * snapshot contract was introduced; freshly created sessions normalize it to
   * either the validated snapshot or null.
   */
  deliveryAddress?: CheckoutDeliveryAddressSnapshot | null;
  orders: readonly CheckoutOrderReference[];
  createdAt: string;
}

export interface CheckoutCreateRequest {
  deliveryAddressId: string;
  note?: string | null;
}

export interface CheckoutExpectedCartItem {
  id: string;
  quantity: number;
  updatedAt: string;
}

export interface CheckoutExpectedCart {
  cartId: string;
  items: CheckoutExpectedCartItem[];
}

export interface CheckoutOperationRequest extends CheckoutCreateRequest {
  expectedCart: CheckoutExpectedCart;
}

export interface CheckoutOperationResult {
  operationId: string;
  status: 'SUCCEEDED';
  checkoutId: string;
}

export interface CheckoutCreationIntent extends CheckoutOperationRequest {
  cartId: string;
  cartClientRevision: number;
}
