import type {
  CustomerOrder,
  CustomerOrderItem,
  CustomerOrderStatus,
} from '../customerOrders/domain/customerOrderTypes';
import {getCustomerOrderJourney} from '../customerOrders/presentation/customerOrderJourney';
import {
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
} from '../customerOrders/presentation/customerOrdersPresentation';

export const LIVE_ORDER_STEPS = ['Accepted', 'Cooked', 'On the way', 'Delivered'] as const;

/** Orders the chef has accepted and that are not delivered yet; `doneSteps` fills LIVE_ORDER_STEPS. */
const LIVE_STATUSES: Partial<Record<CustomerOrderStatus, {status: string; doneSteps: number}>> = {
  CHEF_ACCEPTED: {status: 'Accepted', doneSteps: 1},
  PREPARING: {status: 'Cooking', doneSteps: 1},
  READY_FOR_PICKUP: {status: 'Ready', doneSteps: 2},
  OUT_FOR_DELIVERY: {status: 'On the way', doneSteps: 3},
};

export interface LiveOrder {
  orderId: string;
  kitchenName: string;
  /** Short status for the chip beside the bubble. Orders carry no arrival time, so no ETA is shown. */
  status: string;
  title: string;
  reference: string;
  doneSteps: number;
  paid: string;
  items: readonly CustomerOrderItem[];
}

/** An order still "in progress" this long after it was placed is stuck, not live: no bubble for it. */
const LIVE_ORDER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** The newest order in progress, ready to show; null when nothing is cooking or on the way. */
export function getLiveOrder(orders: readonly CustomerOrder[], now = Date.now()): LiveOrder | null {
  let newest: CustomerOrder | null = null;
  for (const order of orders) {
    if (!LIVE_STATUSES[order.status]) continue;
    if (now - Date.parse(order.createdAt) > LIVE_ORDER_MAX_AGE_MS) continue;
    if (!newest || Date.parse(order.createdAt) > Date.parse(newest.createdAt)) newest = order;
  }
  const live = newest && LIVE_STATUSES[newest.status];
  if (!newest || !live) return null;
  return {
    orderId: newest.id,
    kitchenName: newest.kitchenName,
    status: live.status,
    title: getCustomerOrderJourney(newest, null).title,
    reference: `Order #${getCustomerOrderDisplayReference(newest.id)}`,
    doneSteps: live.doneSteps,
    paid: formatCustomerOrderMoney(newest.grandTotal),
    items: newest.items,
  };
}
