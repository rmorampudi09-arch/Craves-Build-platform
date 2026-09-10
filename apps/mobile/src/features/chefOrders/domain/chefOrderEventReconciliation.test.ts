import {
  CHEF_ORDER_NEAR_REALTIME_BASE_INTERVAL_MS,
  CHEF_ORDER_NEAR_REALTIME_MAX_INTERVAL_MS,
  getChefOrderNearRealtimeIntervalMs,
  reconcileChefOperationalOrderSnapshots,
} from './chefOrderEventReconciliation';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';

function order(
  id: string,
  status: ChefOperationalOrder['status'],
  updatedAt: string | null,
): ChefOperationalOrder {
  return {id, status, updatedAt};
}

describe('chefOrderEventReconciliation', () => {
  it('disables automatic refresh while signed out or backgrounded', () => {
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: false,
        isAppActive: true,
        failureCount: 0,
      }),
    ).toBe(false);
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: true,
        isAppActive: false,
        failureCount: 0,
      }),
    ).toBe(false);
  });

  it('backs off repeated read failures and caps the interval', () => {
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: true,
        isAppActive: true,
        failureCount: 0,
      }),
    ).toBe(CHEF_ORDER_NEAR_REALTIME_BASE_INTERVAL_MS);
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: true,
        isAppActive: true,
        failureCount: 1,
      }),
    ).toBe(60_000);
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: true,
        isAppActive: true,
        failureCount: 3,
      }),
    ).toBe(240_000);
    expect(
      getChefOrderNearRealtimeIntervalMs({
        hasIdentity: true,
        isAppActive: true,
        failureCount: 20,
      }),
    ).toBe(CHEF_ORDER_NEAR_REALTIME_MAX_INTERVAL_MS);
  });

  it('keeps a newer cached lifecycle when an older snapshot arrives', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const current = [order(id, 'READY_FOR_PICKUP', '2026-08-09T12:10:00.000Z')];
    const incoming = [order(id, 'PREPARING', '2026-08-09T12:09:00.000Z')];

    expect(reconcileChefOperationalOrderSnapshots(current, incoming)).toEqual(current);
  });

  it('accepts a newer status and collapses duplicate incoming rows', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const current = [order(id, 'PREPARING', '2026-08-09T12:09:00.000Z')];
    const incoming = [
      order(id, 'PREPARING', '2026-08-09T12:09:30.000Z'),
      order(id, 'READY_FOR_PICKUP', '2026-08-09T12:10:00.000Z'),
    ];

    expect(reconcileChefOperationalOrderSnapshots(current, incoming)).toEqual([
      order(id, 'READY_FOR_PICKUP', '2026-08-09T12:10:00.000Z'),
    ]);
  });

  it('fails closed when conflicting statuses have equal or missing ordering metadata', () => {
    const equalId = '33333333-3333-4333-8333-333333333333';
    const missingId = '44444444-4444-4444-8444-444444444444';
    const current = [
      order(equalId, 'READY_FOR_PICKUP', '2026-08-09T12:10:00.000Z'),
      order(missingId, 'READY_FOR_PICKUP', null),
    ];
    const incoming = [
      order(equalId, 'PREPARING', '2026-08-09T12:10:00.000Z'),
      order(missingId, 'PREPARING', null),
    ];

    expect(reconcileChefOperationalOrderSnapshots(current, incoming)).toEqual(current);
  });

  it('accepts new orders and drops rows absent from the authoritative bounded snapshot', () => {
    const removedId = '55555555-5555-4555-8555-555555555555';
    const newId = '66666666-6666-4666-8666-666666666666';
    const current = [order(removedId, 'DELIVERED', '2026-08-09T10:00:00.000Z')];
    const incoming = [order(newId, 'CHEF_ACCEPTANCE_PENDING', '2026-08-09T12:12:00.000Z')];

    expect(reconcileChefOperationalOrderSnapshots(current, incoming)).toEqual(incoming);
  });
});
