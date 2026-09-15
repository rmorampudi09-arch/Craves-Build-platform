import {QueryClient} from '@tanstack/react-query';
import {CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT} from './api/customerOrdersApi';
import {
  createCustomerOrdersSnapshot,
  selectCustomerOrdersByStatus,
} from './domain/customerOrdersModel';
import type {CustomerOrder} from './domain/customerOrderTypes';
import {
  createCustomerOrdersQueryKey,
  customerOrdersQueryPrefix,
  invalidateCustomerOrdersQueries,
} from './query/customerOrdersQueries';

function order(id: number, status: CustomerOrder['status']): CustomerOrder {
  const uuid = `${String(id).padStart(8, '0')}-1111-4111-8111-111111111111`;
  return {
    id: uuid,
    checkoutId: '22222222-2222-4222-8222-222222222222',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    kitchenName: 'Home Kitchen',
    status,
    currency: 'INR',
    foodSubtotal: {amount: '100', currency: 'INR'},
    platformFee: {amount: '0', currency: 'INR'},
    taxAmount: {amount: '0', currency: 'INR'},
    deliveryFee: {amount: '0', currency: 'INR'},
    grandTotal: {amount: '100', currency: 'INR'},
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-08-08T12:00:00Z',
    updatedAt: '2026-08-08T12:00:00Z',
  };
}

describe('P52 customer orders snapshot and cache model', () => {
  it('derives exact raw-status counts only from the authoritative returned window', () => {
    const snapshot = createCustomerOrdersSnapshot([
      order(1, 'PREPARING'),
      order(2, 'PREPARING'),
      order(3, 'DELIVERED'),
    ]);

    expect(snapshot.returnedCount).toBe(3);
    expect(snapshot.countsByStatus.PREPARING).toBe(2);
    expect(snapshot.countsByStatus.DELIVERED).toBe(1);
    expect(snapshot.countsByStatus.CANCELLED).toBe(0);
    expect(selectCustomerOrdersByStatus(snapshot, 'PREPARING')).toHaveLength(2);
    expect(snapshot.historyCompleteness).toBe('COMPLETE');
  });

  it('does not claim full history when the fixed server window is saturated', () => {
    const orders = Array.from(
      {length: CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT},
      (_, index) => order(index + 1, 'DELIVERED'),
    );

    expect(createCustomerOrdersSnapshot(orders).historyCompleteness).toBe(
      'UNKNOWN_AFTER_SERVER_LIMIT',
    );
  });

  it('scopes the cache by authenticated customer and fixed server window', () => {
    expect(
      createCustomerOrdersQueryKey('33333333-3333-4333-8333-333333333333'),
    ).toEqual([
      'craves',
      'v1',
      'private',
      'customer-orders',
      {
        userId: '33333333-3333-4333-8333-333333333333',
        role: 'CUSTOMER',
        paging: {serverWindowLimit: CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT},
      },
    ]);
  });

  it('invalidates only the customer orders domain prefix', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await invalidateCustomerOrdersQueries(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: customerOrdersQueryPrefix,
    });
  });
});
