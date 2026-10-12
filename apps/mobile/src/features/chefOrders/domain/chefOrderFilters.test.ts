import type {ChefOperationalOrder, ChefOperationalOrderStatus} from '../../chefShell/api/chefOperationalApi';
import {
  CHEF_ORDER_FILTERS,
  FILTER_FOR_ROUTE,
  PAST_KINDS,
  chefOrderChip,
  chefOrderFilterOf,
  chefOrderStatusChip,
  isNotPickedUp,
  filterPastOrders,
  groupPastOrders,
  mergePastOrders,
  ordersForFilter,
  pastGroupLabel,
  pastKindOf,
  ROUTE_FOR_FILTER,
} from './chefOrderFilters';

const order = (id: string, status: ChefOperationalOrderStatus, extra: Partial<ChefOperationalOrder> = {}): ChefOperationalOrder => ({
  id,
  status,
  ...extra,
});

describe('order filters', () => {
  it('lists the five filters in the board order and maps each route to one filter and back', () => {
    expect(CHEF_ORDER_FILTERS.map(entry => entry.label)).toEqual(['New', 'Preparing', 'Ready', 'Scheduled', 'Past']);
    expect(FILTER_FOR_ROUTE).toEqual({
      ChefOrdersNew: 'NEW',
      ChefOrdersPreparing: 'PREPARING',
      ChefOrdersReady: 'READY',
      ChefOrdersScheduled: 'SCHEDULED',
      ChefOrdersCompleted: 'PAST',
    });
    for (const [route, filter] of Object.entries(FILTER_FOR_ROUTE)) {
      expect(ROUTE_FOR_FILTER[filter as keyof typeof ROUTE_FOR_FILTER]).toBe(route);
    }
  });

  it('puts each status in exactly one list, and keeps every finished status in Past', () => {
    const expected: Record<string, string | null> = {
      PAYMENT_PENDING: null,
      PAID: null,
      CHEF_ACCEPTANCE_PENDING: 'NEW',
      CHEF_ACCEPTED: 'PREPARING',
      PREPARING: 'PREPARING',
      READY_FOR_PICKUP: 'READY',
      OUT_FOR_DELIVERY: 'PAST',
      DELIVERED: 'PAST',
      CHEF_REJECTED: 'PAST',
      CANCELLED: 'PAST',
      REFUND_PENDING: 'PAST',
      REFUNDED: 'PAST',
      REFUND_FAILED: 'PAST',
    };
    for (const [status, filter] of Object.entries(expected)) {
      expect(chefOrderFilterOf({status: status as ChefOperationalOrderStatus})).toBe(filter);
    }
  });

  it('shows the longest-waiting order first in New, Preparing and Ready', () => {
    const orders = [
      order('b', 'CHEF_ACCEPTANCE_PENDING', {createdAt: '2026-10-14T09:05:00Z'}),
      order('a', 'CHEF_ACCEPTANCE_PENDING', {createdAt: '2026-10-14T09:00:00Z'}),
      order('c', 'PREPARING', {createdAt: '2026-10-14T08:00:00Z'}),
    ];
    expect(ordersForFilter(orders, 'NEW').map(item => item.id)).toEqual(['a', 'b']);
    expect(ordersForFilter(orders, 'PREPARING').map(item => item.id)).toEqual(['c']);
    expect(ordersForFilter(orders, 'READY')).toEqual([]);
    expect(ordersForFilter(orders, 'SCHEDULED')).toEqual([]);
  });

  it('keeps a rejected order in Past', () => {
    const orders = [order('r', 'CHEF_REJECTED'), order('d', 'DELIVERED'), order('n', 'CHEF_ACCEPTANCE_PENDING')];
    expect(ordersForFilter(orders, 'PAST').map(item => item.id).sort()).toEqual(['d', 'r']);
  });
});

describe('an order left in Ready for more than a day', () => {
  const now = new Date(2026, 9, 14, 15, 0, 0);
  const readyFor = (hours: number, extra: Partial<ChefOperationalOrder> = {}) =>
    order('r', 'READY_FOR_PICKUP', {updatedAt: new Date(now.getTime() - hours * 3_600_000).toISOString(), ...extra});

  it('moves to Past once it has been Ready for over 24 hours, and not before', () => {
    expect(isNotPickedUp(readyFor(23.9), now)).toBe(false);
    expect(isNotPickedUp(readyFor(24), now)).toBe(false);
    expect(isNotPickedUp(readyFor(24.1), now)).toBe(true);
    expect(chefOrderFilterOf(readyFor(2), now)).toBe('READY');
    expect(chefOrderFilterOf(readyFor(30), now)).toBe('PAST');
  });

  it('stays in Ready when nobody knows how long it has been there', () => {
    expect(isNotPickedUp(order('r', 'READY_FOR_PICKUP'), now)).toBe(false);
    expect(isNotPickedUp(order('r', 'READY_FOR_PICKUP', {updatedAt: 'sometime'}), now)).toBe(false);
  });

  it('only a Ready order can be left behind', () => {
    expect(isNotPickedUp(order('p', 'PREPARING', {updatedAt: '2020-01-01T00:00:00Z'}), now)).toBe(false);
  });

  it('leaves the Ready list, appears in Past, and is labelled "Not picked up"', () => {
    const orders = [readyFor(2, {id: 'fresh'}), readyFor(30, {id: 'stale'})];
    expect(ordersForFilter(orders, 'READY', now).map(item => item.id)).toEqual(['fresh']);
    expect(ordersForFilter(orders, 'PAST', now).map(item => item.id)).toEqual(['stale']);
    expect(chefOrderChip(readyFor(30), now)).toEqual({label: 'Not picked up', tone: 'cancelled'});
    expect(chefOrderChip(readyFor(2), now)).toEqual({label: 'Ready', tone: 'ready'});
    expect(chefOrderChip(order('d', 'DELIVERED'), now)).toEqual({label: 'Delivered', tone: 'ready'});
  });

  it('is listed under All only, and is not counted as sold', () => {
    const stale = readyFor(30, {foodSubtotal: 160, updatedAt: new Date(2026, 9, 13, 9, 0).toISOString()});
    expect(pastKindOf(stale, now)).toBe('NOT_PICKED_UP');
    const merged = mergePastOrders([], [stale], now);
    expect(merged).toHaveLength(1);
    expect(filterPastOrders(merged, 'ALL', now)).toHaveLength(1);
    for (const kind of ['DELIVERED', 'ON_THE_WAY', 'CANCELLED', 'REJECTED'] as const) {
      expect(filterPastOrders(merged, kind, now)).toHaveLength(0);
    }
    const [group] = groupPastOrders(merged, now);
    expect(group.total).toBe(0);
    expect(pastGroupLabel(group)).toBe('Yesterday · 1 order');
  });
});

describe('Past orders', () => {
  const now = new Date(2026, 9, 14, 21, 0, 0);
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).toISOString();

  it('sorts the statuses into the five chips the board shows', () => {
    expect(PAST_KINDS.map(kind => kind.label)).toEqual(['All', 'Delivered', 'On the way', 'Cancelled', 'Rejected']);
    expect(pastKindOf({status: 'DELIVERED'})).toBe('DELIVERED');
    expect(pastKindOf({status: 'OUT_FOR_DELIVERY'})).toBe('ON_THE_WAY');
    expect(pastKindOf({status: 'CHEF_REJECTED'})).toBe('REJECTED');
    expect(pastKindOf({status: 'CANCELLED'})).toBe('CANCELLED');
    expect(pastKindOf({status: 'REFUNDED'})).toBe('CANCELLED');
  });

  it('labels each order with a plain chip', () => {
    expect(chefOrderStatusChip('CHEF_ACCEPTANCE_PENDING')).toEqual({label: 'New', tone: 'new'});
    expect(chefOrderStatusChip('PREPARING')).toEqual({label: 'Preparing', tone: 'cooking'});
    expect(chefOrderStatusChip('READY_FOR_PICKUP')).toEqual({label: 'Ready', tone: 'ready'});
    expect(chefOrderStatusChip('OUT_FOR_DELIVERY')).toEqual({label: 'On the way', tone: 'info'});
    expect(chefOrderStatusChip('DELIVERED')).toEqual({label: 'Delivered', tone: 'ready'});
    expect(chefOrderStatusChip('CHEF_REJECTED')).toEqual({label: 'Rejected', tone: 'done'});
    expect(chefOrderStatusChip('CANCELLED')).toEqual({label: 'Cancelled', tone: 'cancelled'});
  });

  it('filters by chip', () => {
    const orders = [order('d', 'DELIVERED'), order('r', 'CHEF_REJECTED'), order('o', 'OUT_FOR_DELIVERY')];
    expect(filterPastOrders(orders, 'ALL')).toHaveLength(3);
    expect(filterPastOrders(orders, 'REJECTED').map(item => item.id)).toEqual(['r']);
    expect(filterPastOrders(orders, 'ON_THE_WAY').map(item => item.id)).toEqual(['o']);
  });

  it('groups by local day, newest day first, with the day count and the food total of orders that were sold', () => {
    const orders = [
      order('y1', 'DELIVERED', {updatedAt: at(13, 20), foodSubtotal: 220}),
      order('t1', 'DELIVERED', {updatedAt: at(14, 11), foodSubtotal: 48}),
      order('t2', 'OUT_FOR_DELIVERY', {updatedAt: at(14, 12), foodSubtotal: 160}),
      order('t3', 'CHEF_REJECTED', {updatedAt: at(14, 10), foodSubtotal: 130}),
    ];
    const groups = groupPastOrders(orders, now);
    expect(groups.map(group => group.title)).toEqual(['Today', 'Yesterday']);
    expect(groups[0].orders.map(item => item.id)).toEqual(['t2', 't1', 't3']);
    expect(groups[0]).toMatchObject({count: 3, total: 208});
    expect(pastGroupLabel(groups[0])).toBe('Today · 3 orders · ₹208');
    expect(pastGroupLabel(groups[1])).toBe('Yesterday · 1 order · ₹220');
  });

  it('leaves the total out when nothing in the day was sold', () => {
    const [group] = groupPastOrders([order('r', 'CHEF_REJECTED', {updatedAt: at(14, 10), foodSubtotal: 130})], now);
    expect(pastGroupLabel(group)).toBe('Today · 1 order');
  });

  it('falls back to the placed time, and puts an order with no time last', () => {
    const groups = groupPastOrders(
      [order('c', 'DELIVERED', {createdAt: at(14, 9)}), order('x', 'DELIVERED')],
      now,
    );
    expect(groups.map(group => group.title)).toEqual(['Today', 'Earlier']);
  });

  it('merges older history under the live orders without doubling any order', () => {
    const live = [order('a', 'DELIVERED', {updatedAt: at(14, 11)}), order('n', 'PREPARING')];
    const history = [order('a', 'OUT_FOR_DELIVERY', {updatedAt: at(14, 9)}), order('h', 'CANCELLED', {updatedAt: at(1, 9)}), order('p', 'PREPARING')];
    const merged = mergePastOrders(live, history);
    expect(merged.map(item => item.id).sort()).toEqual(['a', 'h']);
    expect(merged.find(item => item.id === 'a')?.status).toBe('DELIVERED');
  });
});
