import {createCustomerOrdersSnapshot} from './domain/customerOrdersModel';
import type {CustomerOrder} from './domain/customerOrderTypes';
import {
  CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
  isCustomerOrdersTabAuthoritative,
  selectCustomerOrdersTab,
} from './presentation/customerOrdersPresentation';

function order(status: CustomerOrder['status']): CustomerOrder {
  return {
    id: '12345678-1111-4111-8111-111111111111',
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

describe('P53 customer orders presentation', () => {
  it('keeps only All Orders authoritative until lifecycle bucket mapping exists', () => {
    const preparing = order('PREPARING');
    const delivered = {...order('DELIVERED'), id: '87654321-1111-4111-8111-111111111111'};
    const snapshot = createCustomerOrdersSnapshot([preparing, delivered]);

    expect(isCustomerOrdersTabAuthoritative('ALL')).toBe(true);
    expect(isCustomerOrdersTabAuthoritative('UPCOMING')).toBe(false);
    expect(selectCustomerOrdersTab(snapshot, 'ALL')).toEqual([
      preparing,
      delivered,
    ]);
    expect(selectCustomerOrdersTab(snapshot, 'COMPLETED')).toEqual([]);
    expect(CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER).toBe(
      'CUSTOMER_ORDERS_LIFECYCLE_BUCKET_MAPPING_UNAVAILABLE',
    );
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

  it('keeps reference actions visual-only and fail-closed for later contracts', () => {
    expect(getCustomerOrderReferenceAction('PREPARING')).toBe('TRACK');
    expect(getCustomerOrderReferenceAction('DELIVERED')).toBe('REORDER');
    expect(getCustomerOrderReferenceAction('CANCELLED')).toBeNull();
  });

  it('formats authoritative money and an unambiguous display reference', () => {
    expect(formatCustomerOrderMoney({amount: '320', currency: 'INR'})).toBe(
      '₹320',
    );
    expect(formatCustomerOrderMoney({amount: '12.50', currency: 'USD'})).toBe(
      'USD 12.50',
    );
    expect(
      getCustomerOrderDisplayReference(
        '12345678-1111-4111-8111-111111111111',
      ),
    ).toBe('12345678');
  });
});
