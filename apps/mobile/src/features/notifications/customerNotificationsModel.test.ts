import type {CustomerNotice} from '../customerShell/api/customerShellApi';
import {
  applyCustomerNotificationRead,
  buildCustomerNotificationCategoryCounts,
  filterCustomerNotifications,
  groupCustomerNotifications,
  normalizeCustomerNotifications,
  resolveCustomerNotificationDestination,
} from './domain/customerNotificationsModel';

function notice(overrides: Partial<CustomerNotice> = {}): CustomerNotice {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Order update',
    body: 'Your order is moving.',
    noticeType: 'ORDER_STATUS',
    targetType: 'ORDER',
    targetId: '22222222-2222-4222-8222-222222222222',
    readAt: null,
    createdAt: '2026-08-09T08:00:00.000Z',
    ...overrides,
  };
}

describe('customerNotificationsModel', () => {
  it('deduplicates by stable notification id and sorts newest first', () => {
    const older = notice({createdAt: '2026-08-08T08:00:00.000Z'});
    const newer = notice({
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-08-09T09:00:00.000Z',
    });
    expect(normalizeCustomerNotifications([older, newer, older]).map(item => item.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('derives bounded local category counts without inventing a server aggregate', () => {
    const offer = notice({
      id: '33333333-3333-4333-8333-333333333333',
      targetType: 'COUPON',
      noticeType: 'PROMO',
    });
    const other = notice({
      id: '44444444-4444-4444-8444-444444444444',
      targetType: 'UNKNOWN',
      noticeType: 'GENERAL',
    });
    const notices = [notice(), offer, other];
    expect(buildCustomerNotificationCategoryCounts(notices)).toEqual({
      ALL: 3,
      ORDERS: 1,
      OFFERS: 1,
      UPDATES: 0,
      OTHER: 1,
    });
    expect(filterCustomerNotifications(notices, 'OFFERS')).toEqual([offer]);
  });

  it('groups by Today and Earlier without changing notification identity', () => {
    const today = notice({createdAt: '2026-08-09T08:00:00.000Z'});
    const earlier = notice({
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-08-08T08:00:00.000Z',
    });
    const groups = groupCustomerNotifications(
      [today, earlier],
      new Date('2026-08-09T12:00:00.000Z'),
    );
    expect(groups.map(group => group.title)).toEqual(['Today', 'Earlier']);
  });

  it('allowlists only ORDER and DELIVERY destinations from validated target metadata', () => {
    expect(resolveCustomerNotificationDestination(notice())).toEqual({
      route: 'CustomerOrderDetail',
      orderId: '22222222-2222-4222-8222-222222222222',
    });
    expect(
      resolveCustomerNotificationDestination(notice({targetType: 'DELIVERY'})),
    ).toEqual({
      route: 'CustomerOrderTracking',
      orderId: '22222222-2222-4222-8222-222222222222',
    });
    expect(
      resolveCustomerNotificationDestination(
        notice({targetType: 'CustomerProfileRoot'}),
      ),
    ).toBeNull();
    expect(resolveCustomerNotificationDestination(notice({targetId: null}))).toBeNull();
  });

  it('applies a successful read exactly once and preserves an existing server read time', () => {
    const firstReadAt = '2026-08-09T10:00:00.000Z';
    const secondReadAt = '2026-08-09T10:05:00.000Z';
    const once = applyCustomerNotificationRead([notice()], notice().id, firstReadAt);
    const twice = applyCustomerNotificationRead(once, notice().id, secondReadAt);
    expect(twice[0].readAt).toBe(firstReadAt);
  });
});
