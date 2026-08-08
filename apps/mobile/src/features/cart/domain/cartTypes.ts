export interface CartMoney {
  amount: string;
  currency: string;
}

export interface CartLine {
  lineId: string;
  menuItemId: string;
  kitchenId: string;
  itemName: string;
  kitchenName: string;
  unitPrice: CartMoney;
  quantity: number;
  lineTotal: CartMoney;
  createdAt: string;
  updatedAt: string;
}

export interface CartTotals {
  foodSubtotal: CartMoney;
}

export interface CartSnapshot {
  cartId: string;
  currency: string;
  lines: readonly CartLine[];
  totals: CartTotals;
}

export type CartSnapshotStatus = 'UNINITIALIZED' | 'LOADING' | 'READY' | 'ERROR';

export type CartDependencyStatus =
  | 'UNRESOLVED'
  | 'CURRENT'
  | 'STALE'
  | 'REFRESHING'
  | 'ERROR';

export interface CartCouponDependency {
  status: CartDependencyStatus;
}

export interface CartAddressDependency {
  status: CartDependencyStatus;
  addressId: string | null;
}

export interface CartDeliveryQuoteDependency {
  status: CartDependencyStatus;
}

export interface CartDependencies {
  coupon: CartCouponDependency;
  address: CartAddressDependency;
  deliveryQuote: CartDeliveryQuoteDependency;
}

export type CartMutationScope =
  | 'CART'
  | 'LINE'
  | 'COUPON'
  | 'ADDRESS'
  | 'DELIVERY_QUOTE';

export interface CartMutationEntry {
  requestId: string;
  scope: CartMutationScope;
  targetLineId: string | null;
  status: 'PENDING' | 'FAILED';
  errorCode: string | null;
}
