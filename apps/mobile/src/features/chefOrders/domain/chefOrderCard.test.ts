import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {itemsSummary, toOrderCardOrder} from './chefOrderCard';

const order: ChefOperationalOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'CHEF_ACCEPTANCE_PENDING',
  customerName: 'Priya S.',
  createdAt: '2026-10-14T08:00:00Z',
  foodSubtotal: 220,
  customerNote: 'Less spicy please',
  deliverySummary: {areaName: 'KPHB Colony', city: 'Hyderabad'},
  items: [
    {id: 'a', itemName: 'Chicken curry', quantity: 2, foodType: 'NON_VEG'},
    {id: 'b', itemName: 'Lemon rice', quantity: 1},
  ],
};

describe('toOrderCardOrder', () => {
  it('carries the customer, area, total, dishes and note onto the card', () => {
    expect(toOrderCardOrder(order)).toEqual({
      id: order.id,
      customerName: 'Priya S.',
      area: 'KPHB Colony',
      placedAt: '2026-10-14T08:00:00Z',
      total: 220,
      items: [
        {name: 'Chicken curry', quantity: 2, foodType: 'NON_VEG'},
        {name: 'Lemon rice', quantity: 1, foodType: undefined},
      ],
      note: 'Less spicy please',
    });
  });

  it('falls back to the city when there is no area, and copes with a bare order', () => {
    expect(toOrderCardOrder({...order, deliverySummary: {areaName: null, city: 'Hyderabad'}}).area).toBe('Hyderabad');
    const bare = toOrderCardOrder({id: order.id, status: 'PREPARING'});
    expect(bare.items).toEqual([]);
    expect(bare.area).toBeUndefined();
  });
});

describe('itemsSummary', () => {
  it('joins quantity and dish, and is empty without dishes', () => {
    expect(itemsSummary([{quantity: 1, itemName: 'Dum biriyani'}, {quantity: 2, itemName: 'Bajji'}])).toBe('1 × Dum biriyani, 2 × Bajji');
    expect(itemsSummary(undefined)).toBe('');
  });
});
