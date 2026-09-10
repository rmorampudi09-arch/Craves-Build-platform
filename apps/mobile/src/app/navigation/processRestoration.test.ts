import {
  captureProcessRestorationSnapshot,
  parseProcessRestorationSnapshot,
  toRestorationNavigatePayload,
  type NavigationStateLike,
} from './processRestoration';

function state(routes: NavigationStateLike['routes'], index = 0): NavigationStateLike {
  return {index, routes};
}

describe('P111 process restoration policy', () => {
  it('captures a customer selected tab and safe nested resource route', () => {
    const root = state([
      {
        name: 'Orders',
        state: state([
          {name: 'CustomerOrdersRoot'},
          {name: 'CustomerOrderDetail', params: {orderId: 'order-123'}},
        ], 1),
      },
    ]);

    expect(captureProcessRestorationSnapshot(root, 'CUSTOMER')).toEqual({
      version: 1,
      role: 'CUSTOMER',
      target: {
        kind: 'CUSTOMER_RESOURCE',
        tab: 'Orders',
        route: {screen: 'CustomerOrderDetail', orderId: 'order-123'},
      },
    });
  });

  it('collapses customer draft-bearing routes to their safe owner tab', () => {
    const root = state([
      {
        name: 'Profile',
        state: state([
          {name: 'CustomerProfileRoot'},
          {
            name: 'CustomerProfileEdit',
            params: {password: 'must-never-persist', phone: '+910000000000'},
          },
        ], 1),
      },
    ]);

    expect(captureProcessRestorationSnapshot(root, 'CUSTOMER')).toEqual({
      version: 1,
      role: 'CUSTOMER',
      target: {kind: 'CUSTOMER_TAB', tab: 'Profile'},
    });
  });

  it('collapses chef mutable menu forms instead of serializing draft values', () => {
    const root = state([
      {
        name: 'ChefEditMenuItem',
        params: {
          menuItemId: 'menu-123',
          description: 'unsaved draft',
          paymentSessionId: 'never-store-this',
        },
      },
    ]);

    expect(captureProcessRestorationSnapshot(root, 'CHEF')).toEqual({
      version: 1,
      role: 'CHEF',
      target: {kind: 'CHEF_TAB', tab: 'Menu'},
    });
  });

  it('restores a chef nested order tab through the existing navigator hierarchy', () => {
    const snapshot = {
      version: 1 as const,
      role: 'CHEF' as const,
      target: {
        kind: 'CHEF_NESTED' as const,
        tab: 'Orders' as const,
        screen: 'ChefOrdersReady' as const,
      },
    };

    expect(toRestorationNavigatePayload(snapshot)).toEqual({
      name: 'ChefTabs',
      params: {
        screen: 'Orders',
        params: {screen: 'ChefOrdersReady'},
      },
    });
  });

  it('rejects role-mismatched and payment/provider-shaped persisted state', () => {
    expect(
      parseProcessRestorationSnapshot({
        version: 1,
        role: 'CUSTOMER',
        target: {kind: 'CHEF_TAB', tab: 'Dashboard'},
      }),
    ).toBeNull();

    expect(
      parseProcessRestorationSnapshot({
        version: 1,
        role: 'CUSTOMER',
        target: {kind: 'CUSTOMER_TAB', tab: 'Home'},
        paymentSessionId: 'sensitive-provider-session',
      }),
    ).toBeNull();
  });

  it('falls back instead of persisting malformed resource parameters', () => {
    const root = state([
      {
        name: 'Chefs',
        state: state([
          {name: 'CustomerChefsRoot'},
          {name: 'CustomerKitchenProfile', params: {kitchenId: ''}},
        ], 1),
      },
    ]);

    expect(captureProcessRestorationSnapshot(root, 'CUSTOMER')).toEqual({
      version: 1,
      role: 'CUSTOMER',
      target: {kind: 'CUSTOMER_TAB', tab: 'Chefs'},
    });
  });
});
