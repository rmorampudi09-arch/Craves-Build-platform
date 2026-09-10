import {resolveCartAddressSelection} from './domain/cartAddressSelection';

describe('resolveCartAddressSelection', () => {
  it('marks the delivery quote stale when a different saved address is selected', () => {
    const transition = resolveCartAddressSelection(
      '11111111-1111-4111-8111-111111111111',
      'CURRENT',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(transition).toEqual({
      changed: true,
      address: {
        status: 'CURRENT',
        addressId: '22222222-2222-4222-8222-222222222222',
      },
      deliveryQuoteStatus: 'STALE',
    });
  });

  it('preserves the quote state when the already-selected address is chosen again', () => {
    const addressId = '11111111-1111-4111-8111-111111111111';

    expect(resolveCartAddressSelection(addressId, 'ERROR', addressId)).toEqual({
      changed: false,
      address: {status: 'CURRENT', addressId},
      deliveryQuoteStatus: 'ERROR',
    });
  });

  it('treats the first saved commerce address selection as a quote-invalidating change', () => {
    const transition = resolveCartAddressSelection(
      null,
      'UNRESOLVED',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(transition.changed).toBe(true);
    expect(transition.address.status).toBe('CURRENT');
    expect(transition.deliveryQuoteStatus).toBe('STALE');
  });
});
