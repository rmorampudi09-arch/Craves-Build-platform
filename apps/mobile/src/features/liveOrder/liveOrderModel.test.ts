import type {CustomerOrder} from '../customerOrders/domain/customerOrderTypes';
import {getLiveOrder, LIVE_ORDER_STEPS} from './liveOrderModel';

function order(
  id: string,
  status: CustomerOrder['status'],
  createdAt = '2026-10-15T12:00:00Z',
): CustomerOrder {
  return {
    id,
    checkoutId: '22222222-2222-4222-8222-222222222222',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    kitchenName: 'Relangi',
    status,
    currency: 'INR',
    foodSubtotal: {amount: '40', currency: 'INR'},
    platformFee: {amount: '5', currency: 'INR'},
    taxAmount: {amount: '3.25', currency: 'INR'},
    deliveryFee: {amount: '0', currency: 'INR'},
    grandTotal: {amount: '48.25', currency: 'INR'},
    chefResponseNote: null,
    prepTimeMinutes: 20,
    deliveryAddress: null,
    items: [],
    createdAt,
    updatedAt: createdAt,
  };
}

describe('live order bubble model', () => {
  beforeAll(() => jest.useFakeTimers({now: new Date('2026-10-15T13:00:00Z')}));
  afterAll(() => jest.useRealTimers());

  it('ignores an order stuck in progress for over 12 hours', () => {
    expect(getLiveOrder([order('a', 'READY_FOR_PICKUP', '2026-10-14T23:00:00Z')])).toBeNull();
    expect(getLiveOrder([order('a', 'READY_FOR_PICKUP', '2026-10-15T02:00:00Z')])?.orderId).toBe('a');
  });

  it('shows nothing until the chef accepts, and nothing once the order is done', () => {
    const statuses: CustomerOrder['status'][] = [
      'PAYMENT_PENDING',
      'PAID',
      'CHEF_ACCEPTANCE_PENDING',
      'DELIVERED',
      'CHEF_REJECTED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED',
      'REFUND_FAILED',
    ];
    expect(getLiveOrder(statuses.map((status, i) => order(`id-${i}`, status)))).toBeNull();
    expect(getLiveOrder([])).toBeNull();
  });

  it('fills the four steps by status and uses the status where there is no arrival time', () => {
    const present = (status: CustomerOrder['status']) => {
      const live = getLiveOrder([order('7f6392a6-1111-4111-8111-111111111111', status)]);
      return live && [live.status, live.title, live.doneSteps];
    };
    expect(present('CHEF_ACCEPTED')).toEqual(['Accepted', 'Chef accepted', 1]);
    expect(present('PREPARING')).toEqual(['Cooking', 'Preparing your food', 1]);
    expect(present('READY_FOR_PICKUP')).toEqual(['Ready', 'Ready for pickup', 2]);
    expect(present('OUT_FOR_DELIVERY')).toEqual(['On the way', 'On the way', 3]);
    expect(LIVE_ORDER_STEPS).toHaveLength(4);
  });

  it('picks the newest order in progress and labels it for the card', () => {
    const live = getLiveOrder([
      order('aaaaaaaa-1111-4111-8111-111111111111', 'PREPARING', '2026-10-15T10:00:00Z'),
      order('7f6392a6-1111-4111-8111-111111111111', 'OUT_FOR_DELIVERY', '2026-10-15T11:00:00Z'),
      order('bbbbbbbb-1111-4111-8111-111111111111', 'DELIVERED', '2026-10-15T12:00:00Z'),
    ]);
    expect(live).toMatchObject({
      orderId: '7f6392a6-1111-4111-8111-111111111111',
      kitchenName: 'Relangi',
      reference: 'Order #7F6392A6',
      paid: '₹48.25',
    });
  });
});
