import {resolveRouteChromePolicy} from '../../app/navigation/navigationPolicy';
import type {CartMoney} from '../cart/domain/cartTypes';
import {isViewCartOverlayVisible} from '../cart/viewCartOverlayModel';
import {
  CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE,
  resolveCustomerAddressesContentBottomInset,
} from './customerAddressesActiveCart';
import {
  isCustomerAddressDeliveryReady,
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
  districtName: 'Bengaluru Urban',
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

describe('customer address contract and active/empty visuals', () => {
  it('parses a current saved address and maps it to browsing location state', () => {
    const address = parseCustomerAddress(validAddressResponse);
    expect(address).not.toBeNull();
    if (!address) return;

    expect(isCustomerAddressDeliveryReady(address)).toBe(true);
    expect(toCustomerBrowsingLocation(address)).toEqual({
      kind: 'SAVED_ADDRESS',
      addressId: validAddressResponse.id,
      label: 'Home',
      displayName: 'Indiranagar',
      latitude: 12.9784,
      longitude: 77.6408,
    });
  });

  it('keeps a legacy incomplete address visible so it can be edited or deleted', () => {
    const legacy = parseCustomerAddress({
      ...validAddressResponse,
      recipientName: null,
      areaName: null,
      districtName: null,
      postalCode: null,
      latitude: null,
      longitude: null,
    });

    expect(legacy).not.toBeNull();
    if (!legacy) return;
    expect(isCustomerAddressDeliveryReady(legacy)).toBe(false);
    expect(toCustomerBrowsingLocation(legacy)).toBeNull();
    expect(toCustomerAddressUpdateRequest(legacy)).toBeNull();
  });

  it('preserves district and the complete backend PUT request', () => {
    const address = parseCustomerAddress(validAddressResponse);
    expect(address).not.toBeNull();
    if (!address) return;

    expect(toCustomerAddressUpdateRequest(address, true)).toMatchObject({
      addressLabel: 'HOME',
      recipientName: 'Asha Rao',
      addressLine1: '12 Lake Road',
      areaName: 'Indiranagar',
      districtName: 'Bengaluru Urban',
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

  it('keeps the detached View Cart overlay suppressed because cart now lives in bottom navigation', () => {
    expect(
      isViewCartOverlayVisible({itemCount: 2, subtotal}, addressesRoutePolicy),
    ).toBe(false);
    expect(resolveCustomerAddressesContentBottomInset(true)).toBe(
      CUSTOMER_ADDRESSES_VIEW_CART_CONTENT_CLEARANCE,
    );
    expect(
      isViewCartOverlayVisible({itemCount: 0, subtotal}, addressesRoutePolicy),
    ).toBe(false);
    expect(resolveCustomerAddressesContentBottomInset(false)).toBe(0);
  });
});
