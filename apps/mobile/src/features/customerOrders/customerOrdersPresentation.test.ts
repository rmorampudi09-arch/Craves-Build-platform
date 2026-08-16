import {createCustomerOrdersSnapshot} from './domain/customerOrdersModel';
import type {CustomerOrder} from './domain/customerOrderTypes';
import {
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
  isCustomerOrdersTabAuthoritative,
  selectCustomerOrdersTab,
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

  it('centralizes exact backend status labels without changing raw state', () => {
    expect(getCustomerOrderStatusPresentation('PREPARING')).toEqual({
      label: 'Preparing',
      tone: 'accent',
    });
    expect(getCustomerOrderStatusPresentation('REFUND_FAILED')).toEqual({
      label: 'Refund needs attention',
      tone: 'danger',
    });
  });

  it('keeps only server-supported reference actions visible', () => {
    expect(getCustomerOrderReferenceAction('PREPARING')).toBe('TRACK');
    expect(getCustomerOrderReferenceAction('DELIVERED')).toBe('REORDER');
    expect(getCustomerOrderReferenceAction('CANCELLED')).toBeNull();
  });

  it('formats authoritative money and an unambiguous display reference', () => {
    expect(formatCustomerOrderMoney({amount: '320', currency: 'INR'})).toBe('₹320');
    expect(formatCustomerOrderMoney({amount: '12.50', currency: 'USD'})).toBe('USD 12.50');
    expect(getCustomerOrderDisplayReference('12345678-1111-4111-8111-111111111111')).toBe('12345678');
  });
});
