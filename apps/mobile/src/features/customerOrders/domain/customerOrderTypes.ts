export const CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT = 50;

export const CUSTOMER_ORDER_STATUSES = [
  'PAYMENT_PENDING',
  'PAID',
  'CHEF_ACCEPTANCE_PENDING',
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CHEF_REJECTED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
] as const;

export type CustomerOrderStatus = (typeof CUSTOMER_ORDER_STATUSES)[number];

export interface CustomerOrderMoney {
  amount: string;
  currency: string;
}

export interface CustomerOrderItem {
  id: string;
  menuItemId: string;
  itemName: string;
  category: string | null;
  foodType: string | null;
  unitPrice: CustomerOrderMoney;
  quantity: number;
  lineTotal: CustomerOrderMoney;
}

export interface CustomerOrderDeliveryAddress {
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  areaName: string | null;
  city: string;
  state: string;
  postalCode: string;
}

export interface CustomerOrder {
  id: string;
  checkoutId: string;
  kitchenId: string;
  kitchenName: string;
  status: CustomerOrderStatus;
  currency: string;
  foodSubtotal: CustomerOrderMoney;
  platformFee: CustomerOrderMoney;
  taxAmount: CustomerOrderMoney;
  deliveryFee: CustomerOrderMoney;
  grandTotal: CustomerOrderMoney;
  chefResponseNote: string | null;
  prepTimeMinutes: number | null;
  deliveryAddress: CustomerOrderDeliveryAddress | null;
  items: readonly CustomerOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export type CustomerOrderStatusCounts = Readonly<
  Record<CustomerOrderStatus, number>
>;

export type CustomerOrdersHistoryCompleteness =
  | 'COMPLETE'
  | 'UNKNOWN_AFTER_SERVER_LIMIT';

export interface CustomerOrdersSnapshot {
  orders: readonly CustomerOrder[];
  countsByStatus: CustomerOrderStatusCounts;
  returnedCount: number;
  historyCompleteness: CustomerOrdersHistoryCompleteness;
}
