import {QueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../src/app/query/queryKeys';
import {store} from '../../src/app/store/store';
import {
  parseInboundUrl,
  resolveInboundRoute,
} from '../../src/app/navigation/inboundRouting';
import {
  parseProcessRestorationSnapshot,
  toRestorationNavigatePayload,
} from '../../src/app/navigation/processRestoration';
import type {Identity} from '../../src/features/auth/domain/types';
import {
  authActions,
  authReducer,
} from '../../src/features/auth/state/authSlice';
import {cartApi} from '../../src/features/cart/api/cartApi';
import type {CartSnapshot} from '../../src/features/cart/domain/cartTypes';
import {
  refreshCartSnapshot,
} from '../../src/features/cart/state/cartRefresh';
import {setCartItemQuantity} from '../../src/features/cart/state/cartMutations';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../src/features/cart/state/cartSelectors';
import {cartActions} from '../../src/features/cart/state/cartSlice';
import {nearbyChefDiscoveryQueryPrefix} from '../../src/features/chefDiscovery/query/nearbyChefDiscoveryQueries';
import type {ChefOrderDetail} from '../../src/features/chefOrders/api/chefOrderDetailApi';
import {
  createChefOrderDecisionCoordinator,
  type ChefOrderDecisionApi,
} from '../../src/features/chefOrders/domain/chefOrderDecision';
import {reconcileChefOperationalOrderSnapshots} from '../../src/features/chefOrders/domain/chefOrderEventReconciliation';
import type {ChefOperationalOrder} from '../../src/features/chefShell/api/chefOperationalApi';
import {switchChefToCustomerRole} from '../../src/features/chefProfile/state/chefProfileRoleSwitch';
import type {CustomerNotice} from '../../src/features/customerShell/api/customerShellApi';
import {invalidateCustomerLocationDependentQueries} from '../../src/features/customerShell/query/customerLocationReconciliation';
import {customerHomeFeedQueryPrefix} from '../../src/features/home/query/homeFeedQueries';
import {resolveCustomerNotificationDestination} from '../../src/features/notifications/domain/customerNotificationsModel';

jest.mock('../../src/features/cart/api/cartApi', () => ({
  cartApi: {
    getSnapshot: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const CART_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const MENU_ITEM_ID = '44444444-4444-4444-8444-444444444444';
const KITCHEN_ID = '55555555-5555-4555-8555-555555555555';
const ORDER_ID = '66666666-6666-4666-8666-666666666666';

const identity: Identity = {
  id: CUSTOMER_ID,
  firebaseUid: 'firebase-p122',
  phoneNumber: '+910000000000',
  email: null,
  emailVerified: false,
  displayName: 'P122 Integration User',
  status: 'ACTIVE',
  roles: ['CUSTOMER', 'CHEF'],
  lastLoginAt: null,
};

const persistedCart: CartSnapshot = {
  cartId: CART_ID,
  currency: 'INR',
  lines: [
    {
      lineId: LINE_ID,
      menuItemId: MENU_ITEM_ID,
      kitchenId: KITCHEN_ID,
      itemName: 'Vegetable Biryani',
      kitchenName: 'P122 Kitchen',
      unitPrice: {amount: '125.5', currency: 'INR'},
      quantity: 2,
      lineTotal: {amount: '251', currency: 'INR'},
      createdAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:01:00.000Z',
    },
  ],
  totals: {
    foodSubtotal: {amount: '251', currency: 'INR'},
  },
};

function cartWithQuantity(quantity: number): CartSnapshot {
  const amount = String(125.5 * quantity);
  return {
    ...persistedCart,
    lines: persistedCart.lines.map(line => ({
      ...line,
      quantity,
      lineTotal: {amount, currency: 'INR'},
      updatedAt: '2026-08-10T08:05:00.000Z',
    })),
    totals: {foodSubtotal: {amount, currency: 'INR'}},
  };
}

function customerNotice(): CustomerNotice {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    title: 'Order update',
    body: 'Your order status changed.',
    noticeType: 'ORDER_STATUS',
    targetType: 'ORDER',
    targetId: ORDER_ID,
    readAt: null,
    createdAt: '2026-08-10T08:10:00.000Z',
  };
}

function chefOrderDetail(
  overrides: Partial<ChefOrderDetail> = {},
): ChefOrderDetail {
  return {
    id: ORDER_ID,
    checkoutId: '88888888-8888-4888-8888-888888888888',
    kitchenId: KITCHEN_ID,
    kitchenName: 'P122 Kitchen',
    status: 'CHEF_ACCEPTANCE_PENDING',
    currency: 'INR',
    foodSubtotal: 320,
    platformFee: 10,
    taxAmount: 16,
    deliveryFee: 25,
    grandTotal: 371,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:05:00.000Z',
    ...overrides,
  };
}

function operationalOrder(
  status: ChefOperationalOrder['status'],
  updatedAt: string,
): ChefOperationalOrder {
  return {id: ORDER_ID, status, updatedAt};
}

describe('P122 cross-feature integration completion', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    store.dispatch(authActions.signedOut());
    store.dispatch(cartActions.resetCartDomain());
  });

  afterEach(() => {
    store.dispatch(authActions.signedOut());
    store.dispatch(cartActions.resetCartDomain());
  });

  it('keeps authenticated customer restoration role-scoped and navigable', () => {
    let auth = authReducer(undefined, authActions.authenticated(identity));
    auth = authReducer(
      auth,
      authActions.accountResolved({
        identity,
        resolution: {
          flow: 'CUSTOMER',
          requestedRole: 'CUSTOMER',
          authorizedRole: 'CUSTOMER',
          onboardingStatus: 'READY',
        },
      }),
    );

    const restoration = parseProcessRestorationSnapshot({
      version: 1,
      role: 'CUSTOMER',
      target: {
        kind: 'CUSTOMER_RESOURCE',
        tab: 'Orders',
        route: {screen: 'CustomerOrderDetail', orderId: ORDER_ID},
      },
    });

    expect(auth.bootstrapStatus).toBe('authenticated');
    expect(auth.accountResolution?.authorizedRole).toBe(restoration?.role);
    expect(restoration && toRestorationNavigatePayload(restoration)).toEqual({
      name: 'Orders',
      params: {
        screen: 'CustomerOrderDetail',
        params: {orderId: ORDER_ID},
      },
    });
  });

  it('clears Chef-private state before Customer role resolution and blocks stale-role routing', async () => {
    store.dispatch(authActions.authenticated(identity));
    store.dispatch(
      authActions.accountResolved({
        identity,
        resolution: {
          flow: 'CHEF',
          requestedRole: 'CHEF',
          authorizedRole: 'CHEF',
          onboardingStatus: 'APPROVED',
        },
      }),
    );

    const queryClient = new QueryClient();
    const chefKey = createPrivateQueryKey('chef-profile-kitchen', {
      userId: CUSTOMER_ID,
      role: 'CHEF',
    });
    const customerKey = createPrivateQueryKey('customer-profile', {
      userId: CUSTOMER_ID,
      role: 'CUSTOMER',
    });
    queryClient.setQueryData(chefKey, {privateChefState: true});
    queryClient.setQueryData(customerKey, {customerState: true});

    await switchChefToCustomerRole(store.dispatch, queryClient);

    const auth = store.getState().auth;
    expect(queryClient.getQueryData(chefKey)).toBeUndefined();
    expect(queryClient.getQueryData(customerKey)).toEqual({customerState: true});
    expect(auth.selectedRole).toBe('CUSTOMER');
    expect(auth.identity).toEqual(identity);
    expect(auth.accountResolution).toBeNull();
    expect(
      resolveInboundRoute(
        {kind: 'CHEF'},
        {
          authenticated: auth.bootstrapStatus === 'authenticated',
          authorizedRole: auth.accountResolution?.authorizedRole ?? null,
          productReady: auth.accountResolution !== null,
        },
      ),
    ).toEqual({status: 'DEFER', reason: 'PRODUCT_NOT_READY'});
  });

  it('restores the server-persisted cart and reconciles a later mutation to authoritative totals', async () => {
    const getSnapshotMock = cartApi.getSnapshot as jest.Mock;
    const updateItemMock = cartApi.updateItem as jest.Mock;
    getSnapshotMock.mockResolvedValueOnce(persistedCart);

    const restored = await store.dispatch(refreshCartSnapshot());

    expect(restored.status).toBe('APPLIED');
    expect(selectCartItemCount(store.getState())).toBe(2);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '251',
      currency: 'INR',
    });

    updateItemMock.mockResolvedValueOnce(cartWithQuantity(3));
    const mutation = await store.dispatch(
      setCartItemQuantity({lineId: LINE_ID, quantity: 3}),
    );

    expect(mutation.status).toBe('APPLIED');
    expect(selectCartItemCount(store.getState())).toBe(3);
    expect(selectCartFoodSubtotal(store.getState())).toEqual({
      amount: '376.5',
      currency: 'INR',
    });
    expect(updateItemMock).toHaveBeenCalledWith(LINE_ID, 3);
  });

  it('invalidates both location-dependent discovery domains as one cross-screen change', async () => {
    const queryClient = new QueryClient();
    const homeKey = [...customerHomeFeedQueryPrefix, 'p122-home'] as const;
    const chefsKey = [...nearbyChefDiscoveryQueryPrefix, 'p122-chefs'] as const;
    queryClient.setQueryData(homeKey, {pages: ['home']});
    queryClient.setQueryData(chefsKey, {pages: ['chefs']});

    await invalidateCustomerLocationDependentQueries(queryClient);

    expect(queryClient.getQueryState(homeKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(chefsKey)?.isInvalidated).toBe(true);
  });

  it('maps an allowlisted notification target through the same authenticated inbound order destination', () => {
    const destination = resolveCustomerNotificationDestination(customerNotice());
    const candidate = parseInboundUrl(`craves://order/${ORDER_ID}`);

    expect(destination).toEqual({
      route: 'CustomerOrderDetail',
      orderId: ORDER_ID,
    });
    expect(candidate).toEqual({kind: 'ORDER', orderId: ORDER_ID});
    expect(
      candidate &&
        resolveInboundRoute(candidate, {
          authenticated: true,
          authorizedRole: 'CUSTOMER',
          productReady: true,
        }),
    ).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CUSTOMER_ORDER_DETAIL', orderId: ORDER_ID},
    });
  });

  it('carries a Chef accept decision into newer operational status without stale regression', async () => {
    const server: ChefOrderDecisionApi = {
      getOrder: jest.fn(async () => chefOrderDetail()),
      acceptOrder: jest.fn(async () =>
        chefOrderDetail({
          status: 'CHEF_ACCEPTED',
          prepTimeMinutes: 30,
          updatedAt: '2026-08-10T08:06:00.000Z',
        }),
      ),
      rejectOrder: jest.fn(async () =>
        chefOrderDetail({status: 'CHEF_REJECTED'}),
      ),
    };

    const decision = await createChefOrderDecisionCoordinator(server).execute({
      kind: 'accept',
      orderId: ORDER_ID,
      prepTimeMinutes: 30,
    });
    expect(decision.order.status).toBe('CHEF_ACCEPTED');

    const preparing = operationalOrder('PREPARING', '2026-08-10T08:07:00.000Z');
    const reconciled = reconcileChefOperationalOrderSnapshots(
      [operationalOrder('CHEF_ACCEPTANCE_PENDING', '2026-08-10T08:05:00.000Z')],
      [preparing],
    );
    expect(reconciled).toEqual([preparing]);

    expect(
      reconcileChefOperationalOrderSnapshots(
        reconciled,
        [operationalOrder('CHEF_ACCEPTANCE_PENDING', '2026-08-10T08:04:00.000Z')],
      ),
    ).toEqual(reconciled);
  });
});
