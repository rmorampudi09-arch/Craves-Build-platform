import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefDashboardEarning, ChefDashboardMenuItem} from '../api/chefDashboardApi';
import {acceptReadyMinutes, deliveredToday, earnedToday, splitHomeOrders} from './chefDashboardPresentation';

const now = new Date(2026, 9, 14, 15, 0);
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();
const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

const earning = (status: ChefDashboardEarning['status'], netPayable: number, createdAt: string) =>
  ({status, netPayable, createdAt}) as ChefDashboardEarning;
const order = (n: number, status: ChefOperationalOrder['status'], extra: Partial<ChefOperationalOrder> = {}): ChefOperationalOrder => ({
  id: id(n),
  status,
  ...extra,
});
const dish = (dishId: string, itemName: string, preparationTimeMinutes: number | null) =>
  ({id: dishId, itemName, preparationTimeMinutes}) as ChefDashboardMenuItem;

describe('earnedToday', () => {
  it('adds what was earned today and ignores yesterday, drafts and reversals', () => {
    const entries = [
      earning('APPROVED', 400, at(2026, 9, 14, 9, 0)),
      earning('SETTLED', 840.5, at(2026, 9, 14, 12, 0)),
      earning('SETTLEMENT_PENDING', 100, at(2026, 9, 14, 13, 0)),
      earning('APPROVED', 999, at(2026, 9, 13, 23, 0)),
      earning('DRAFT', 50, at(2026, 9, 14, 8, 0)),
      earning('REVERSED', 70, at(2026, 9, 14, 8, 0)),
    ];
    expect(earnedToday(entries, now)).toBe(1340.5);
    expect(earnedToday([], now)).toBe(0);
  });
});

describe('deliveredToday', () => {
  it('counts orders delivered today only', () => {
    const orders = [
      order(1, 'DELIVERED', {updatedAt: at(2026, 9, 14, 12, 0)}),
      order(2, 'DELIVERED', {updatedAt: at(2026, 9, 13, 12, 0)}),
      order(3, 'DELIVERED', {updatedAt: null}),
      order(4, 'PREPARING', {updatedAt: at(2026, 9, 14, 12, 0)}),
    ];
    expect(deliveredToday(orders, now)).toBe(1);
  });
});

describe('splitHomeOrders', () => {
  it('puts the oldest new order first and keeps only kitchen statuses in the kitchen list', () => {
    const {pending, inKitchen} = splitHomeOrders([
      order(1, 'CHEF_ACCEPTANCE_PENDING', {createdAt: at(2026, 9, 14, 14, 50)}),
      order(2, 'CHEF_ACCEPTANCE_PENDING', {createdAt: at(2026, 9, 14, 14, 40)}),
      order(3, 'PREPARING', {updatedAt: at(2026, 9, 14, 14, 30)}),
      order(4, 'READY_FOR_PICKUP', {updatedAt: at(2026, 9, 14, 14, 20)}),
      order(5, 'OUT_FOR_DELIVERY'),
      order(6, 'DELIVERED'),
    ]);
    expect(pending.map(o => o.id)).toEqual([id(2), id(1)]);
    expect(inKitchen.map(o => o.id)).toEqual([id(4), id(3)]);
  });
});

describe('splitHomeOrders: an order left in Ready for over a day', () => {
  it('is no longer in the kitchen; it moved to Past as "Not picked up"', () => {
    const {inKitchen} = splitHomeOrders(
      [
        order(1, 'READY_FOR_PICKUP', {updatedAt: at(2026, 9, 14, 12, 0)}),
        order(2, 'READY_FOR_PICKUP', {updatedAt: at(2026, 9, 13, 12, 0)}),
        order(3, 'PREPARING', {updatedAt: at(2026, 9, 10, 12, 0)}),
      ],
      now,
    );
    expect(inKitchen.map(o => o.id).sort()).toEqual([id(1), id(3)].sort());
  });
});

describe('acceptReadyMinutes', () => {
  const menu = [dish(id(7), 'Chicken curry', 20), dish(id(8), 'Lemon rice', 10), dish(id(9), 'Raita', null)];

  it('uses the time the order already carries', () => {
    expect(acceptReadyMinutes(order(1, 'CHEF_ACCEPTANCE_PENDING', {prepTimeMinutes: 35}), menu)).toBe(35);
  });

  it('takes the longest dish, matched by dish id and otherwise by name', () => {
    const items = [
      {id: id(1), itemName: 'Chicken curry', quantity: 1, menuItemId: id(7)},
      {id: id(2), itemName: 'lemon rice ', quantity: 1},
    ];
    expect(acceptReadyMinutes(order(1, 'CHEF_ACCEPTANCE_PENDING', {items}), menu)).toBe(20);
  });

  it('falls back to 15 minutes for unknown dishes, dishes without a time, and empty orders', () => {
    const unknown = [{id: id(1), itemName: 'Mystery', quantity: 1}];
    expect(acceptReadyMinutes(order(1, 'CHEF_ACCEPTANCE_PENDING', {items: unknown}), menu)).toBe(15);
    const noTime = [{id: id(1), itemName: 'Raita', quantity: 1, menuItemId: id(9)}];
    expect(acceptReadyMinutes(order(1, 'CHEF_ACCEPTANCE_PENDING', {items: noTime}), menu)).toBe(15);
    expect(acceptReadyMinutes(order(1, 'CHEF_ACCEPTANCE_PENDING'), menu)).toBe(15);
  });
});
