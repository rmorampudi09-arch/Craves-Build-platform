import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {buildChefOrderTimeline} from './chefOrderTimeline';

const base: ChefOrderDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  checkoutId: '22222222-2222-4222-8222-222222222222',
  kitchenId: '33333333-3333-4333-8333-333333333333',
  kitchenName: 'Kitchen',
  status: 'PREPARING',
  currency: 'INR',
  foodSubtotal: 100,
  platformFee: 0,
  taxAmount: 5,
  deliveryFee: 40,
  grandTotal: 145,
  chefResponseNote: null,
  prepTimeMinutes: 15,
  deliveryAddress: null,
  items: [],
  createdAt: new Date(2026, 9, 14, 12, 8).toISOString(),
  updatedAt: new Date(2026, 9, 14, 12, 10).toISOString(),
};
const at = (hour: number, minute: number) => new Date(2026, 9, 14, hour, minute).toISOString();
const summary = (steps: ReturnType<typeof buildChefOrderTimeline>) => steps.map(step => [step.label, step.state, step.detail]);

describe('buildChefOrderTimeline', () => {
  it('shows a cooking order as placed, cooking now, then the steps still to come', () => {
    expect(summary(buildChefOrderTimeline(base))).toEqual([
      ['Order placed', 'done', '12:08 PM'],
      ['Cooking', 'now', '12:10 PM · ready in 15 min'],
      ['Ready for pickup', 'todo', undefined],
      ['On the way', 'todo', undefined],
      ['Delivered', 'todo', undefined],
    ]);
  });

  it('uses the times the server sends for each step', () => {
    const steps = buildChefOrderTimeline({
      ...base,
      status: 'DELIVERED',
      deliveryPartner: {name: 'Suresh', phone: null, photoUrl: null, pickupEtaAt: null},
      statusHistory: [
        {status: 'CHEF_ACCEPTANCE_PENDING', at: at(12, 8)},
        {status: 'CHEF_ACCEPTED', at: at(12, 9)},
        {status: 'PREPARING', at: at(12, 10)},
        {status: 'READY_FOR_PICKUP', at: at(12, 25)},
        {status: 'OUT_FOR_DELIVERY', at: at(12, 32)},
        {status: 'DELIVERED', at: at(12, 51)},
      ],
    });
    expect(summary(steps)).toEqual([
      ['Order placed', 'done', '12:08 PM'],
      ['You accepted', 'done', '12:09 PM · ready in 15 min'],
      ['Marked ready', 'done', '12:25 PM'],
      ['Picked up by Suresh', 'done', '12:32 PM'],
      ['Delivered', 'done', '12:51 PM'],
    ]);
  });

  it('marks a ready order as waiting for pickup, using when it was updated for the time', () => {
    expect(summary(buildChefOrderTimeline({...base, status: 'READY_FOR_PICKUP', updatedAt: at(12, 25)}))).toEqual([
      ['Order placed', 'done', '12:08 PM'],
      ['You accepted', 'done', 'ready in 15 min'],
      ['Ready for pickup', 'now', '12:25 PM'],
      ['On the way', 'todo', undefined],
      ['Delivered', 'todo', undefined],
    ]);
  });

  it('ends a rejected or cancelled order where it stopped', () => {
    expect(summary(buildChefOrderTimeline({...base, status: 'CHEF_REJECTED', prepTimeMinutes: null}))).toEqual([
      ['Order placed', 'done', '12:08 PM'],
      ['You rejected the order', 'done', '12:10 PM'],
    ]);
    expect(buildChefOrderTimeline({...base, status: 'CANCELLED'}).map(step => step.label)).toEqual(['Order placed', 'Order cancelled']);
  });

  it('shows an order that is not paid or sent to the kitchen yet as just placed, never as cancelled', () => {
    for (const status of ['PAYMENT_PENDING', 'PAID'] as const) {
      const steps = buildChefOrderTimeline({...base, status, prepTimeMinutes: null});
      expect(steps.map(step => step.label)).not.toContain('Order cancelled');
      expect(steps.map(step => step.label)).not.toContain('You rejected the order');
      expect(summary(steps)[0]).toEqual(['Order placed', 'now', '12:08 PM']);
      expect(steps.slice(1).every(step => step.state === 'todo')).toBe(true);
    }
  });

  it('says cancelled for every cancelled or refunded status', () => {
    for (const status of ['CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'] as const) {
      expect(buildChefOrderTimeline({...base, status}).map(step => step.label)).toEqual(['Order placed', 'Order cancelled']);
    }
  });

  it('shows a new order as just placed', () => {
    expect(summary(buildChefOrderTimeline({...base, status: 'CHEF_ACCEPTANCE_PENDING', prepTimeMinutes: null}))).toEqual([
      ['Order placed', 'now', '12:08 PM'],
      ['Accepted', 'todo', undefined],
      ['Ready for pickup', 'todo', undefined],
      ['On the way', 'todo', undefined],
      ['Delivered', 'todo', undefined],
    ]);
  });
});
