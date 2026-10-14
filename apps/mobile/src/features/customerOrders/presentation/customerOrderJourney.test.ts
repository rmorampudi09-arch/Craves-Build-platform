import {getCustomerOrderJourney} from './customerOrderJourney';

const order = (status: Parameters<typeof getCustomerOrderJourney>[0]['status']) => ({
  status,
  prepTimeMinutes: 15,
});

describe('getCustomerOrderJourney', () => {
  it('keeps the map blurred on the three kitchen steps until pickup', () => {
    expect(getCustomerOrderJourney(order('PAYMENT_PENDING'), null)).toMatchObject({kind: 'KITCHEN', step: -1});
    expect(getCustomerOrderJourney(order('CHEF_ACCEPTANCE_PENDING'), null)).toMatchObject({kind: 'KITCHEN', step: 0});
    expect(getCustomerOrderJourney(order('PREPARING'), null)).toMatchObject({
      kind: 'KITCHEN',
      step: 1,
      detail: 'The chef is cooking now. Ready in about 15 min.',
    });
    expect(getCustomerOrderJourney(order('READY_FOR_PICKUP'), 'AT_PICKUP')).toMatchObject({kind: 'KITCHEN', step: 2});
  });

  it('opens the map once the delivery partner has the food', () => {
    expect(getCustomerOrderJourney(order('OUT_FOR_DELIVERY'), null)).toMatchObject({kind: 'DELIVERY', title: 'On the way'});
    expect(getCustomerOrderJourney(order('READY_FOR_PICKUP'), 'PICKED_UP')).toMatchObject({kind: 'DELIVERY'});
    expect(getCustomerOrderJourney(order('OUT_FOR_DELIVERY'), 'AT_DROPOFF')).toMatchObject({
      kind: 'DELIVERY',
      title: 'Arriving at your location',
    });
    expect(getCustomerOrderJourney(order('DELIVERED'), null)).toMatchObject({kind: 'DELIVERY', delivered: true});
  });

  it('shows no map for closed orders', () => {
    expect(getCustomerOrderJourney(order('CHEF_REJECTED'), null).kind).toBe('CLOSED');
    expect(getCustomerOrderJourney(order('REFUNDED'), null).kind).toBe('CLOSED');
  });
});
