import type {
  ChefOperationalNotice,
  ChefOperationalOrder,
} from '../api/chefOperationalApi';
import {
  chefCounterBadgeLabel,
  deriveChefOperationalCounters,
} from './chefOperationalCounters';

const order = (
  id: string,
  status: ChefOperationalOrder['status'],
): ChefOperationalOrder => ({id, status});

const notice = (id: string, readAt: string | null): ChefOperationalNotice => ({
  id,
  title: 'Order update',
  body: 'A kitchen order changed.',
  noticeType: 'ORDER',
  targetType: 'ORDER',
  targetId: null,
  readAt,
  createdAt: '2026-08-09T08:00:00Z',
});

describe('chefOperationalCounters', () => {
  it('derives shared order and notification counters from authoritative records', () => {
    const counters = deriveChefOperationalCounters(
      [
        order('1', 'CHEF_ACCEPTANCE_PENDING'),
        order('2', 'CHEF_ACCEPTED'),
        order('3', 'PREPARING'),
        order('4', 'READY_FOR_PICKUP'),
        order('5', 'OUT_FOR_DELIVERY'),
        order('6', 'DELIVERED'),
      ],
      [notice('n1', null), notice('n2', '2026-08-09T08:10:00Z')],
    );

    expect(counters).toEqual({
      pendingAcceptance: 1,
      activeOrders: 4,
      readyForPickup: 1,
      unreadNotifications: 1,
    });
  });

  it('does not count terminal orders as active', () => {
    const counters = deriveChefOperationalCounters(
      [
        order('1', 'DELIVERED'),
        order('2', 'CHEF_REJECTED'),
        order('3', 'CANCELLED'),
        order('4', 'REFUNDED'),
      ],
      [],
    );

    expect(counters.activeOrders).toBe(0);
    expect(counters.pendingAcceptance).toBe(0);
  });

  it('caps visual badge labels without changing the underlying count', () => {
    expect(chefCounterBadgeLabel(0)).toBeNull();
    expect(chefCounterBadgeLabel(7)).toBe('7');
    expect(chefCounterBadgeLabel(100)).toBe('99+');
  });
});
