import {store} from '../../src/app/store/store';
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
import {refreshCartSnapshot} from '../../src/features/cart/state/cartRefresh';
import {selectCartItemCount} from '../../src/features/cart/state/cartSelectors';
import {cartActions} from '../../src/features/cart/state/cartSlice';
import type {ChefOrderDetail} from '../../src/features/chefOrders/api/chefOrderDetailApi';
import {
  createChefOrderDecisionCoordinator,
  type ChefOrderDecisionApi,
} from '../../src/features/chefOrders/domain/chefOrderDecision';
import {reconcileChefOperationalOrderSnapshots} from '../../src/features/chefOrders/domain/chefOrderEventReconciliation';
import {
  buildChefMenuItemRequest,
  type ChefMenuFormValues,
} from '../../src/features/chefMenu/domain/chefMenuForm';
import {
  CHEF_PAYOUT_CONTRACT_MODEL,
  getChefWithdrawEligibilityBoundary,
  hasCompleteChefPayoutContract,
} from '../../src/features/chefPayout/domain/chefPayoutContract';
import {
  getChefSubscriptionMutationBoundary,
  hasCompleteChefSubscriptionContract,
} from '../../src/features/chefSubscription/domain/chefSubscriptionContract';
import type {ChefOperationalOrder} from '../../src/features/chefShell/api/chefOperationalApi';
import {
  createCheckoutSessionCoordinator,
  checkoutSessionCapability,
} from '../../src/features/checkout/domain/checkoutSessionCoordinator';
import type {CheckoutSession} from '../../src/features/checkout/domain/checkoutTypes';
import {
  CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
  type CustomerDishDetail,
} from '../../src/features/dishDetail/api/dishDetailApi';
import {evaluateDishCartRevalidation} from '../../src/features/dishDetail/dishDetailPurchase';
import {getProductionCustomerOrderMutationDecision} from '../../src/features/customerOrders/domain/customerOrderActionEligibility';
import {
  createPaymentHandoffCoordinator,
  paymentHandoffCapability,
} from '../../src/features/payment/domain/paymentHandoffCoordinator';
import {
  createPaymentRecoveryCoordinator,
  paymentRecoveryCapability,
} from '../../src/features/payment/domain/paymentRecoveryCoordinator';
import type {
  PaymentOrderHandoffSession,
  PaymentOrderSnapshot,
} from '../../src/features/payment/domain/paymentTypes';

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
const CHECKOUT_ID = '77777777-7777-4777-8777-777777777777';
const ADDRESS_ID = '88888888-8888-4888-8888-888888888888';
const PAYMENT_ORDER_ID = '99999999-9999-4999-8999-999999999999';

const identity: Identity = {
  id: CUSTOMER_ID,
  firebaseUid: 'firebase-p123',
  phoneNumber: '+910000000000',
  email: null,
  emailVerified: false,
  displayName: 'P123 E2E User',
  status: 'ACTIVE',
  roles: ['CUSTOMER', 'CHEF'],
  lastLoginAt: null,
};

const cartSnapshot: CartSnapshot = {
  cartId: CART_ID,
  currency: 'INR',
  lines: [
    {
      lineId: LINE_ID,
      menuItemId: MENU_ITEM_ID,
      kitchenId: KITCHEN_ID,
      itemName: 'Vegetable Biryani',
      kitchenName: 'P123 Kitchen',
      unitPrice: {amount: '220', currency: 'INR'},
      quantity: 1,
      lineTotal: {amount: '220', currency: 'INR'},
      createdAt: '2026-08-10T09:00:00.000Z',
      updatedAt: '2026-08-10T09:00:00.000Z',
    },
  ],
  totals: {
    foodSubtotal: {amount: '220', currency: 'INR'},
  },
};

const checkoutSession: CheckoutSession = {
  checkoutId: CHECKOUT_ID,
  customerIdentityId: CUSTOMER_ID,
  status: 'PAYMENT_PENDING',
  currency: 'INR',
  foodSubtotal: {amount: '220', currency: 'INR'},
  platformFee: {amount: '10', currency: 'INR'},
  taxAmount: {amount: '11', currency: 'INR'},
  deliveryFee: {amount: '29', currency: 'INR'},
  grandTotal: {amount: '270', currency: 'INR'},
  chargePolicyId: 'charge-policy-p123',
  deliveryAddressId: ADDRESS_ID,
  orders: [
    {
      orderId: ORDER_ID,
      checkoutId: CHECKOUT_ID,
      status: 'PAYMENT_PENDING',
    },
  ],
  createdAt: '2026-08-10T09:05:00.000Z',
};

const paymentOrder: PaymentOrderHandoffSession = {
  paymentOrderId: PAYMENT_ORDER_ID,
  checkoutId: CHECKOUT_ID,
  cravesPaymentOrderRef: 'CRAVES-P123-1',
  provider: 'RAZORPAY',
  providerOrderId: 'order_p123_1',
  providerPaymentId: null,
  checkoutKeyId: 'rzp_test_p123_public_key',
  paymentSessionId: null,
  amount: {amount: '270.00', currency: 'INR'},
  status: 'PAYMENT_PENDING',
  createdAt: '2026-08-10T09:06:00.000Z',
};

const dishDetail: CustomerDishDetail = {
  id: MENU_ITEM_ID,
  kitchen: {
    id: KITCHEN_ID,
    kitchenName: 'P123 Kitchen',
    displayName: 'P123 Kitchen',
    description: null,
    areaName: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
  },
  itemName: 'Vegetable Biryani',
  description: 'Freshly prepared biryani',
  category: 'Rice',
  cuisine: null,
  foodType: 'VEG',
  price: {amount: 220, currency: 'INR'},
  servesCount: 1,
  preparationTimeMinutes: 30,
  spiceLevel: 'MEDIUM',
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  availability: {available: true, status: 'ACTIVE'},
  images: [],
  ingredients: null,
  allergens: null,
  reviewSummary: {aggregateRating: null, reviewCount: null},
  favoriteState: null,
  contractGaps: CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
};

function chefOrderDetail(
  overrides: Partial<ChefOrderDetail> = {},
): ChefOrderDetail {
  return {
    id: ORDER_ID,
    checkoutId: CHECKOUT_ID,
    kitchenId: KITCHEN_ID,
    kitchenName: 'P123 Kitchen',
    status: 'CHEF_ACCEPTANCE_PENDING',
    currency: 'INR',
    foodSubtotal: 220,
    platformFee: 10,
    taxAmount: 11,
    deliveryFee: 29,
    grandTotal: 270,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-08-10T09:05:00.000Z',
    updatedAt: '2026-08-10T09:06:00.000Z',
    ...overrides,
  };
}

function operationalOrder(
  status: ChefOperationalOrder['status'],
  updatedAt: string,
): ChefOperationalOrder {
  return {id: ORDER_ID, status, updatedAt};
}

describe('P123 critical E2E journeys', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    store.dispatch(authActions.signedOut());
    store.dispatch(cartActions.resetCartDomain());
  });

  afterEach(() => {
    store.dispatch(authActions.signedOut());
    store.dispatch(cartActions.resetCartDomain());
  });

  it('restores an authenticated Customer into the intended order journey', () => {
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
    expect(auth.accountResolution?.authorizedRole).toBe('CUSTOMER');
    expect(restoration && toRestorationNavigatePayload(restoration)).toEqual({
      name: 'Orders',
      params: {
        screen: 'CustomerOrderDetail',
        params: {orderId: ORDER_ID},
      },
    });
  });

  it('carries a verified discovery/cart state through checkout, payment handoff, and authoritative paid recovery', async () => {
    expect(evaluateDishCartRevalidation(dishDetail, dishDetail)).toEqual({
      status: 'READY',
    });

    const getSnapshotMock = cartApi.getSnapshot as jest.Mock;
    getSnapshotMock.mockResolvedValueOnce(cartSnapshot);
    expect((await store.dispatch(refreshCartSnapshot())).status).toBe('APPLIED');
    expect(selectCartItemCount(store.getState())).toBe(1);

    const createCheckout = jest.fn(async () => checkoutSession);
    const checkoutCoordinator = createCheckoutSessionCoordinator(createCheckout);
    const created = await checkoutCoordinator.create({
      cartId: CART_ID,
      cartClientRevision: 1,
      deliveryAddressId: ADDRESS_ID,
      note: null,
    });
    expect(created.checkoutId).toBe(CHECKOUT_ID);
    expect(createCheckout).toHaveBeenCalledTimes(1);

    const createPayment = jest.fn(async () => paymentOrder);
    const handoff = await createPaymentHandoffCoordinator(createPayment).prepare(
      created,
    );
    expect(handoff).toMatchObject({
      provider: 'RAZORPAY',
      paymentOrderId: PAYMENT_ORDER_ID,
      checkoutId: CHECKOUT_ID,
      providerOrderId: paymentOrder.providerOrderId,
      amount: {amount: '270.00', currency: 'INR'},
    });

    const paidCheckout: CheckoutSession = {
      ...created,
      status: 'PAID',
      orders: created.orders.map(order => ({...order, status: 'PAID'})),
    };
    const paidPaymentOrder: PaymentOrderSnapshot = {
      paymentOrderId: PAYMENT_ORDER_ID,
      checkoutId: CHECKOUT_ID,
      customerIdentityId: CUSTOMER_ID,
      cravesPaymentOrderRef: paymentOrder.cravesPaymentOrderRef,
      provider: 'RAZORPAY',
      providerOrderId: paymentOrder.providerOrderId,
      providerPaymentId: 'pay_p123_1',
      amount: paymentOrder.amount,
      status: 'PAID',
      providerStatus: 'captured',
      createdAt: paymentOrder.createdAt,
      updatedAt: '2026-08-10T09:07:00.000Z',
    };
    const recover = createPaymentRecoveryCoordinator(
      jest.fn(async () => ({
        paymentOrderId: PAYMENT_ORDER_ID,
        status: 'PAID' as const,
        providerStatus: 'captured',
        providerPaymentId: 'pay_p123_1',
      })),
      jest.fn(async () => paidPaymentOrder),
      jest.fn(async () => paidCheckout),
    );
    const recovery = await recover.recover(handoff, {kind: 'APP_RESUME'});

    expect(recovery.outcome).toBe('SUCCEEDED');
    expect(recovery.checkout.status).toBe('PAID');
    expect(recovery.newPaymentAttemptAllowed).toBe(false);
  });

  it('keeps unsupported customer order mutations and reviews fail-closed', () => {
    expect(getProductionCustomerOrderMutationDecision('CANCEL')).toMatchObject({
      kind: 'BLOCKED',
      blockers: [
        'P56_CUSTOMER_ORDER_CANCELLATION_ELIGIBILITY_CONTRACT_UNAVAILABLE',
      ],
    });
    expect(
      CUSTOMER_DISH_DETAIL_CONTRACT_GAPS.find(gap => gap.capability === 'REVIEWS'),
    ).toEqual(
      expect.objectContaining({
        capability: 'REVIEWS',
        reason: expect.stringContaining('no authoritative customer dish review'),
      }),
    );
  });

  it('carries a Chef accept decision forward through newer operational lifecycle events without stale regression', async () => {
    const server: ChefOrderDecisionApi = {
      getOrder: jest.fn(async () => chefOrderDetail()),
      acceptOrder: jest.fn(async () =>
        chefOrderDetail({
          status: 'CHEF_ACCEPTED',
          prepTimeMinutes: 30,
          updatedAt: '2026-08-10T09:07:00.000Z',
        }),
      ),
      rejectOrder: jest.fn(async () =>
        chefOrderDetail({status: 'CHEF_REJECTED'}),
      ),
    };

    const accepted = await createChefOrderDecisionCoordinator(server).execute({
      kind: 'accept',
      orderId: ORDER_ID,
      prepTimeMinutes: 30,
    });
    expect(accepted.order.status).toBe('CHEF_ACCEPTED');

    const preparing = operationalOrder('PREPARING', '2026-08-10T09:08:00.000Z');
    const ready = operationalOrder('READY_FOR_PICKUP', '2026-08-10T09:09:00.000Z');
    const delivered = operationalOrder('DELIVERED', '2026-08-10T09:10:00.000Z');

    let reconciled = reconcileChefOperationalOrderSnapshots(
      [operationalOrder('CHEF_ACCEPTANCE_PENDING', '2026-08-10T09:05:00.000Z')],
      [preparing],
    );
    reconciled = reconcileChefOperationalOrderSnapshots(reconciled, [ready]);
    reconciled = reconcileChefOperationalOrderSnapshots(reconciled, [delivered]);

    expect(reconciled).toEqual([delivered]);
    expect(
      reconcileChefOperationalOrderSnapshots(
        reconciled,
        [operationalOrder('PREPARING', '2026-08-10T09:08:30.000Z')],
      ),
    ).toEqual(reconciled);
  });

  it('builds the supported Chef menu create journey from validated form state', () => {
    const values: ChefMenuFormValues = {
      itemName: 'Paneer Bowl',
      description: 'Paneer with vegetables',
      category: 'Main Course',
      foodType: 'VEG',
      price: '180',
      servesCount: '1',
      preparationTimeMinutes: '20',
      spiceLevel: 'MILD',
      unitPackageWeightGrams: '350',
      thermoboxRequired: false,
      available: true,
    };

    expect(buildChefMenuItemRequest(values, 'ADD_ITEM')).toEqual({
      itemName: 'Paneer Bowl',
      description: 'Paneer with vegetables',
      category: 'Main Course',
      foodType: 'VEG',
      price: 180,
      servesCount: 1,
      preparationTimeMinutes: 20,
      spiceLevel: 'MILD',
      unitPackageWeightGrams: 350,
      thermoboxRequired: false,
      available: true,
      status: 'ACTIVE',
    });
  });

  it('records payment capability and remaining contract blockers instead of masking them', () => {
    expect(checkoutSessionCapability.serverIdempotencySupported).toBe(false);
    expect(paymentHandoffCapability.nativeRazorpayLaunchSupported).toBe(true);
    expect(paymentHandoffCapability.tokenizedPaymentMethodContractSupported).toBe(false);
    expect(paymentRecoveryCapability.nativeRazorpayCallbackAdapterSupported).toBe(true);
    expect(paymentRecoveryCapability.newPaymentAttemptAfterTerminalFailureSupported).toBe(false);

    expect(CHEF_PAYOUT_CONTRACT_MODEL.status).toBe('blocked');
    expect(hasCompleteChefPayoutContract()).toBe(false);
    expect(getChefWithdrawEligibilityBoundary()).toMatchObject({
      availability: 'unavailable',
      code: 'BACKEND_CONTRACT_UNAVAILABLE',
      canWithdraw: false,
    });

    expect(hasCompleteChefSubscriptionContract()).toBe(false);
    expect(getChefSubscriptionMutationBoundary('changePlan')).toMatchObject({
      availability: 'unavailable',
      code: 'BACKEND_CONTRACT_UNAVAILABLE',
      allowed: false,
    });
  });
});
