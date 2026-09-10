import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {
  deriveChefOrderDecisionActionability,
  deriveChefOrderDetailContractModel,
} from './chefOrderDetailModel';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function detail(
  overrides: Partial<ChefOrderDetail> = {},
): ChefOrderDetail {
  return {
    id: ORDER_ID,
    checkoutId: '22222222-2222-4222-8222-222222222222',
    kitchenId: '33333333-3333-4333-8333-333333333333',
    kitchenName: 'Meena’s Kitchen',
    status: 'CHEF_ACCEPTANCE_PENDING',
    currency: 'INR',
    foodSubtotal: 320,
    platformFee: 10,
    taxAmount: 16,
    deliveryFee: 25,
    grandTotal: 371,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: {
      sourceAddressId: '44444444-4444-4444-8444-444444444444',
      recipientName: 'Customer',
      contactPhoneNumber: '+919999999999',
      addressLine1: '12 Sample Road',
      addressLine2: null,
      landmark: null,
      areaName: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9716,
      longitude: 77.6412,
    },
    items: [],
    createdAt: '2026-08-09T08:00:00Z',
    updatedAt: '2026-08-09T08:05:00Z',
    ...overrides,
  };
}

describe('chefOrderDetailModel', () => {
  it('offers decision candidates only for the latest server pending status', () => {
    expect(
      deriveChefOrderDecisionActionability('CHEF_ACCEPTANCE_PENDING'),
    ).toEqual({
      sourceStatus: 'CHEF_ACCEPTANCE_PENDING',
      acceptCandidate: true,
      rejectCandidate: true,
      requiresServerRevalidation: true,
    });

    expect(deriveChefOrderDecisionActionability('CHEF_ACCEPTED')).toEqual({
      sourceStatus: 'CHEF_ACCEPTED',
      acceptCandidate: false,
      rejectCandidate: false,
      requiresServerRevalidation: true,
    });
  });

  it('derives contact and map data only from the server-authorized order snapshot', () => {
    const model = deriveChefOrderDetailContractModel(detail());

    expect(model.authorizedContactSnapshot).toEqual({
      recipientName: 'Customer',
      contactPhoneNumber: '+919999999999',
    });
    expect(model.deliveryMapPoint).toEqual({
      latitude: 12.9716,
      longitude: 77.6412,
    });
  });

  it('keeps missing Reference-39 contracts explicitly unavailable', () => {
    const model = deriveChefOrderDetailContractModel(detail());

    expect(model.unavailable.acceptanceDeadline).toEqual(
      expect.objectContaining({
        availability: 'UNAVAILABLE',
        code: 'BACKEND_CONTRACT_UNAVAILABLE',
      }),
    );
    expect(model.unavailable.statusTimeline.availability).toBe('UNAVAILABLE');
    expect(model.unavailable.customerOrderNote.availability).toBe('UNAVAILABLE');
    expect(model.unavailable.paymentMethod.availability).toBe('UNAVAILABLE');
    expect(model.unavailable.contactAuthorizationAndChat.availability).toBe(
      'UNAVAILABLE',
    );
  });

  it('does not invent contact or map state for legacy orders without a snapshot', () => {
    const model = deriveChefOrderDetailContractModel(
      detail({deliveryAddress: null}),
    );

    expect(model.authorizedContactSnapshot).toBeNull();
    expect(model.deliveryMapPoint).toBeNull();
  });
});
