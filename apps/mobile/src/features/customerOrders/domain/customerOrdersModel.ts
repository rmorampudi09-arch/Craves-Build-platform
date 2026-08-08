import {CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT} from '../api/customerOrdersApi';
import {
  CUSTOMER_ORDER_STATUSES,
  type CustomerOrder,
  type CustomerOrdersSnapshot,
  type CustomerOrderStatus,
  type CustomerOrderStatusCounts,
} from './customerOrderTypes';

function emptyStatusCounts(): Record<CustomerOrderStatus, number> {
  return Object.fromEntries(
    CUSTOMER_ORDER_STATUSES.map(status => [status, 0]),
  ) as Record<CustomerOrderStatus, number>;
}

export function createCustomerOrdersSnapshot(
  orders: readonly CustomerOrder[],
): CustomerOrdersSnapshot {
  const counts = emptyStatusCounts();
  for (const order of orders) {
    counts[order.status] += 1;
  }

  return {
    orders,
    countsByStatus: counts as CustomerOrderStatusCounts,
    returnedCount: orders.length,
    historyCompleteness:
      orders.length < CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT
        ? 'COMPLETE'
        : 'UNKNOWN_AFTER_SERVER_LIMIT',
  };
}

export function selectCustomerOrdersByStatus(
  snapshot: CustomerOrdersSnapshot,
  status: CustomerOrderStatus,
): readonly CustomerOrder[] {
  return snapshot.orders.filter(order => order.status === status);
}
