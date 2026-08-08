import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerAddressesContentBottomInset,
} from './customerAddressesActiveCart';
import {
  parseCustomerAddress,
  toCustomerAddressUpdateRequest,
  toCustomerBrowsingLocation,
} from './domain/customerAddressContract';

const validAddressResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  addressLabel: 'HOME',
  recipientName: 'Asha Rao',
  contactPhoneNumber: '+919876543210',
  addressLine1: '12 Lake Road',
  addressLine2: 'Floor 2',
  landmark: null,
  areaName: 'Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  latitude: 12.9784,
  longitude: 77.6408,
  isDefault: false,
  active: true,
  createdAt: '2026-08-01T10:00:00Z',
  updatedAt: '2026-08-02T10:00:00Z',
};

const subtotal: CartMoney = {amount: '640', currency: 'INR'};
const addressesRoutePolicy = resolveRouteChromePolicy(
  'Customer',
  'CustomerAddresses',
);

describe('P66 My Addresses contract and active/empty visuals', () => {
  it('parses the exact supported saved-address response and maps it to global location state', () => {
    const address = parseCustomerAddress(validAddressResponse);
    expect(address).not.toBeNull();
    if (!address) {
      return;
    }

    expect(toCustomerBrowsingLocation(address)).toEqual({
      kind: 'SAVED_ADDRESS',
      addressId: validAddressResponse.id,
      label: 'Home',
      displayName: 'Indiranagar',
      latitude: 12.9784,
      longitude: 77.6408,
    });
  });

  it('preserves the full PUT request while setting an existing address as default', () => {
    const address = parseCustomerAddress(validAddressResponse);
    expect(address).not.toBeNull();
    if (!address) {
      return;
    }

    expect(toCustomerAddressUpdateRequest(address, true)).toMatchObject({
      addressLabel: 'HOME',
      recipientName: 'Asha Rao',
      addressLine1: '12 Lake Road',
      latitude: 12.9784,
      longitude: 77.6408,
      isDefault: true,
    });
  });

  it('rejects an address response outside the approved enum contract', () => {
    expect(
      parseCustomerAddress({...validAddressResponse, addressLabel: 'PRIMARY'}),
    ).toBeNull();
  });

  it('shows the shared View Cart overlay only for the active-cart reference', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 2, subtotal}, addressesRoutePolicy),
    ).toBe(true);
    expect(resolveCustomerAddressesContentBottomInset(true)).toBe(
      CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE,
    );

    expect(
      isViewCartOverlayVisible({itemCount: 0, subtotal}, addressesRoutePolicy),
    ).toBe(false);
    expect(resolveCustomerAddressesContentBottomInset(false)).toBe(0);
  });
});
