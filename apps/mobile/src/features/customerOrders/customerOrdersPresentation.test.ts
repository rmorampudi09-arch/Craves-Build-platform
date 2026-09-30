import {createCustomerOrdersSnapshot} from './domain/customerOrdersModel';
import type {CustomerOrder} from './domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderProgressPresentation,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
  isCustomerOrdersTabAuthoritative,
  selectCustomerOrdersTab,
  getPendingOrderVisibilityExpiry,
  PENDING_ORDER_VISIBILITY_MS,
} from './presentation/customerOrdersPresentation';

function order(status: CustomerOrder['status'], id = '12345678-1111-4111-8111-111111111111'): CustomerOrder {
  return {
    id,
    checkoutId: '22222222-2222-4222-8222-222222222222',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    kitchenName: 'Home Kitchen',
    status,
    currency: 'INR',
    foodSubtotal: {amount: '280', currency: 'INR'},
    platformFee: {amount: '10', currency: 'INR'},
    taxAmount: {amount: '15', currency: 'INR'},
    deliveryFee: {amount: '15', currency: 'INR'},
    grandTotal: {amount: '320', currency: 'INR'},
    chefResponseNote: null,
    prepTimeMinutes: 25,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-08-08T12:00:00Z',
    updatedAt: '2026-08-08T12:00:00Z',
  };
}

describe('customer orders lifecycle tabs', () => {
  it('shows pending payments for ten minutes from the last server update', () => {
    const pending = order('PAYMENT_PENDING');
    const snapshot = createCustomerOrdersSnapshot([pending]);
    const expiresAt = Date.parse(pending.updatedAt) + PENDING_ORDER_VISIBILITY_MS;
    expect(selectCustomerOrdersTab(snapshot, 'ALL', expiresAt - 1)).toEqual([pending]);
    expect(selectCustomerOrdersTab(snapshot, 'UPCOMING', expiresAt)).toEqual([pending]);
    expect(selectCustomerOrdersTab(snapshot, 'ALL', expiresAt + 1)).toEqual([]);
    expect(selectCustomerOrdersTab(snapshot, 'UPCOMING', expiresAt + 1)).toEqual([]);
    expect(snapshot.orders).toEqual([pending]);
  });

  it('uses a newer pending update and retains every non-pending lifecycle state', () => {
    const pending = {...order('PAYMENT_PENDING'), updatedAt: '2026-08-08T12:20:00Z'};
    const paid = order('PAID');
    const delivered = order('DELIVERED');
    const refunded = order('REFUNDED');
    const snapshot = createCustomerOrdersSnapshot([pending, paid, delivered, refunded]);
    expect(selectCustomerOrdersTab(snapshot, 'ALL', Date.parse('2026-08-08T12:25:00Z'))).toEqual([pending, paid, delivered, refunded]);
    expect(selectCustomerOrdersTab(snapshot, 'ALL', Date.parse('2026-08-08T13:00:00Z'))).toEqual([paid, delivered, refunded]);
  });

  it('falls back to creation time and keeps orders with an unusable clock visible', () => {
    const pending = {...order('PAYMENT_PENDING'), updatedAt: 'invalid'};
    expect(getPendingOrderVisibilityExpiry(pending)).toBe(Date.parse(pending.createdAt) + PENDING_ORDER_VISIBILITY_MS);
    expect(getPendingOrderVisibilityExpiry({...pending, createdAt: 'invalid'})).toBeNull();
  });

  it('maps exact backend statuses into all four authoritative tabs', () => {
    const preparing = order('PREPARING');
    const delivered = order('DELIVERED', '87654321-1111-4111-8111-111111111111');
    const cancelled = order('CANCELLED', 'aaaaaaaa-1111-4111-8111-111111111111');
    const refunded = order('REFUNDED', 'bbbbbbbb-1111-4111-8111-111111111111');
    const snapshot = createCustomerOrdersSnapshot([preparing, delivered, cancelled, refunded]);

    expect(isCustomerOrdersTabAuthoritative('ALL')).toBe(true);
    expect(isCustomerOrdersTabAuthoritative('UPCOMING')).toBe(true);
    expect(isCustomerOrdersTabAuthoritative('COMPLETED')).toBe(true);
    expect(isCustomerOrdersTabAuthoritative('CANCELLED')).toBe(true);
    expect(selectCustomerOrdersTab(snapshot, 'UPCOMING')).toEqual([preparing]);
    expect(selectCustomerOrdersTab(snapshot, 'COMPLETED')).toEqual([delivered]);
    expect(selectCustomerOrdersTab(snapshot, 'CANCELLED')).toEqual([cancelled, refunded]);
  });

  it('centralizes customer-facing lifecycle labels without changing raw state', () => {
    expect(getCustomerOrderStatusPresentation('PAYMENT_PENDING')).toEqual({
      label: 'Payment pending',
      tone: 'warning',
    });
    expect(getCustomerOrderStatusPresentation('CHEF_ACCEPTANCE_PENDING')).toEqual({
      label: 'Awaiting chef',
      tone: 'warning',
    });
    expect(getCustomerOrderStatusPresentation('READY_FOR_PICKUP')).toEqual({
      label: 'Ready for pickup',
      tone: 'success',
    });
    expect(getCustomerOrderStatusPresentation('OUT_FOR_DELIVERY')).toEqual({
      label: 'Item picked up',
      tone: 'accent',
    });
    expect(getCustomerOrderStatusPresentation('REFUND_PENDING')).toEqual({
      label: 'Refund pending',
      tone: 'warning',
    });
    expect(getCustomerOrderStatusPresentation('REFUND_FAILED')).toEqual({
      label: 'Refund needs attention',
      tone: 'danger',
    });
  });

  it('keeps estimated, delivered and cancelled supporting lines separate from the main status', () => {
    const preparing = order('PREPARING');
    const delivered = order('DELIVERED');
    const cancelled = order('CANCELLED');

    expect(getCustomerOrderProgressPresentation(preparing).label).toContain(
      'Estimated delivery',
    );
    expect(getCustomerOrderProgressPresentation(delivered).label).toContain(
      'Delivered on',
    );
    expect(getCustomerOrderProgressPresentation(cancelled).label).toContain(
      'Cancelled on',
    );
  });

  it('keeps only server-supported reference actions visible', () => {
    expect(getCustomerOrderReferenceAction('PREPARING')).toBe('TRACK');
    expect(getCustomerOrderReferenceAction('DELIVERED')).toBe('REORDER');
    expect(getCustomerOrderReferenceAction('CANCELLED')).toBeNull();
  });

  it('formats authoritative money, references and relative order dates', () => {
    expect(formatCustomerOrderMoney({amount: '320', currency: 'INR'})).toBe('₹320');
    expect(formatCustomerOrderMoney({amount: '12.50', currency: 'USD'})).toBe('USD 12.50');
    expect(getCustomerOrderDisplayReference('12345678-1111-4111-8111-111111111111')).toBe('12345678');

    const now = new Date('2026-08-17T14:00:00Z');
    expect(formatCustomerOrderCreatedAt('2026-08-17T12:00:00Z', now)).toContain('Today');
    expect(formatCustomerOrderCreatedAt('2026-08-16T12:00:00Z', now)).toContain('Yesterday');
  });
});
