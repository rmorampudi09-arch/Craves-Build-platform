import React from 'react';
import {act, create} from 'react-test-renderer';
import type {CustomerAddress} from '../../customerAddresses/domain/customerAddressContract';
import {
  MealPlanCheckoutProvider,
  useMealPlanCheckout,
  useSelectedDeliveryAddress,
} from './MealPlanCheckoutContext';

let mockData: CustomerAddress[] | undefined;
jest.mock('../../customerAddresses/query/customerAddressQueries', () => ({
  useCustomerAddressesQuery: () => ({data: mockData, isLoading: mockData === undefined}),
}));

function address(id: string, overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id,
    identityId: 'customer-1',
    addressLabel: 'HOME',
    recipientName: 'Asha',
    contactPhoneNumber: '+919999999999',
    addressLine1: '1 Main Road',
    addressLine2: null,
    landmark: null,
    areaName: 'Madhapur',
    districtName: null,
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500081',
    latitude: 17.4,
    longitude: 78.4,
    isDefault: false,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCheckout() {
  const seen: {
    checkout?: ReturnType<typeof useMealPlanCheckout>;
    selected?: ReturnType<typeof useSelectedDeliveryAddress>;
  } = {};
  function Probe() {
    seen.checkout = useMealPlanCheckout();
    seen.selected = useSelectedDeliveryAddress();
    return null;
  }
  act(() => {
    create(
      <MealPlanCheckoutProvider>
        <Probe />
      </MealPlanCheckoutProvider>,
    );
  });
  return seen;
}

describe('useSelectedDeliveryAddress', () => {
  it('skips addresses that are not delivery-ready and prefers the default', () => {
    mockData = [
      address('no-coords', {latitude: null, isDefault: true}),
      address('first'),
      address('default', {isDefault: true}),
    ];
    const seen = renderCheckout();
    expect(seen.selected?.addresses.map(a => a.id)).toEqual(['first', 'default']);
    expect(seen.selected?.address?.id).toBe('default');
  });

  it('falls back to the first ready address, then honours an explicit choice', () => {
    mockData = [address('first'), address('second')];
    const seen = renderCheckout();
    expect(seen.selected?.address?.id).toBe('first');
    act(() => seen.checkout?.setDeliveryAddressId('second'));
    expect(seen.selected?.address?.id).toBe('second');
    act(() => seen.checkout?.setStartDate('2026-10-12'));
    expect(seen.checkout?.startDate).toBe('2026-10-12');
  });

  it('returns no address when nothing qualifies, and reports loading', () => {
    mockData = [address('inactive', {active: false})];
    expect(renderCheckout().selected).toMatchObject({address: null, addresses: [], loading: false});
    mockData = undefined;
    expect(renderCheckout().selected?.loading).toBe(true);
  });
});

describe('useMealPlanCheckout', () => {
  it('throws outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useMealPlanCheckout();
      return null;
    }
    expect(() =>
      act(() => {
        create(<Probe />);
      }),
    ).toThrow(/MealPlanCheckoutProvider/);
    spy.mockRestore();
  });
});
