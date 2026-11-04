import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerCartScreen} from './CustomerCartScreen';
import {cartReducer, cartActions} from '../state/cartSlice';
import {cartApi} from '../api/cartApi';
import {checkCartServiceability} from '../api/cartServiceabilityApi';
import {checkoutSessionCoordinator} from '../../checkout/domain/checkoutSessionCoordinator';
import {razorpayGateway} from '../../payment/gateway/razorpayGateway';
import {recoverPersistedPaymentAttempt} from '../../payment/domain/persistedPaymentRecovery';
import {pendingPaymentAttemptStore} from '../../payment/storage/pendingPaymentAttemptStore';
import {AppApiError} from '../../../core/http/apiError';
import {Button} from '../../../shared/components/Button';
import {DeletionPausedNotice} from '../../accountDeletion/components/DeletionPausedNotice';
import {RecoverableErrorBanner} from '../../../shared/components/LifecycleStates';
import type {CartSnapshot} from '../domain/cartTypes';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';

const mockSnapshot: CartSnapshot = {
  cartId: '11111111-1111-4111-8111-111111111111', currency: 'INR',
  totals: {foodSubtotal: {amount: '80.00', currency: 'INR'}},
  lines: [{lineId: '22222222-2222-4222-8222-222222222222',
    menuItemId: '33333333-3333-4333-8333-333333333333',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    itemName: 'Meal', kitchenName: 'Kitchen', quantity: 1,
    unitPrice: {amount: '80.00', currency: 'INR'}, lineTotal: {amount: '80.00', currency: 'INR'},
    createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z'}],
};
const mockLocation = {addressId: 'saved-address', latitude: 17.4, longitude: 78.4, displayName: 'Home'};
const money = (amount: string) => ({amount, currency: 'INR'});
const mockCheckout: CheckoutSession = {
  deliveryAddressId: mockLocation.addressId, foodSubtotal: money('80.00'), platformFee: money('0.00'),
  deliveryFee: money('40.00'), taxAmount: money('11.20'), grandTotal: money('131.20'),
  checkoutId: 'checkout', customerIdentityId: 'customer', status: 'PAYMENT_PENDING',
  currency: 'INR', chargePolicyId: 'policy', createdAt: '2026-09-30T10:00:00Z',
  orders: [{orderId: 'order', checkoutId: 'checkout', status: 'PAYMENT_PENDING'}],
};
let mockState: {cart: ReturnType<typeof cartReducer>; auth: {identity: {phoneNumber: null}}};
const mockDispatch = jest.fn();
const mockSelectorResults = new Map<Function, unknown>();
let mockBeforeRemove: ((event: {preventDefault: () => void}) => void) | null = null;

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: typeof mockState) => unknown) => {
    if (!mockSelectorResults.has(select)) mockSelectorResults.set(select, select(mockState));
    return mockSelectorResults.get(select);
  },
  useAppDispatch: () => mockDispatch,
}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({
  goBack: jest.fn(), navigate: jest.fn(), getParent: () => ({navigate: jest.fn()}),
  addListener: (_event: string, listener: typeof mockBeforeRemove) => { mockBeforeRemove = listener; return () => undefined; },
})}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, bottom: 24, left: 0, right: 0})}));
jest.mock('../../accountDeletion/state/AccountDeletionProvider', () => ({
  useAccountDeletion: () => ({pending: null, keep: jest.fn(async () => 'kept'), keeping: false, notice: null}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../shared/components/ScreenShell', () => ({ScreenShell: 'ScreenShell'}));
jest.mock('../../../app/navigation/CustomerBottomNavController', () => ({useCustomerBottomNavScroll: () => ({onScroll: jest.fn(), scrollEventThrottle: 16})}));
jest.mock('../../customerShell/components/CustomerLocationSelector', () => ({CustomerLocationSelector: () => null}));
jest.mock('../../customerShell/hooks/useCustomerHeaderState', () => ({useCustomerHeaderState: () => ({selectedLocation: mockLocation})}));
jest.mock('../api/cartApi', () => ({cartApi: {validate: jest.fn()}, buildCartSnapshotRequest: jest.fn()}));
jest.mock('../state/cartRefresh', () => ({refreshCartSnapshot: () => ({type: 'refresh'})}));
jest.mock('../state/cartMutations', () => ({
  ...jest.requireActual('../state/cartMutations'),
  addCartItem: (command: unknown) => ({type: 'add', command}),
}));
jest.mock('../api/cartServiceabilityApi', () => ({checkCartServiceability: jest.fn()}));
jest.mock('../../customerOrders/query/customerOrderCatalogQueries', () => ({useCustomerOrderKitchenPresentationQuery: () => ({data: undefined})}));
jest.mock('../../checkout/domain/checkoutSessionCoordinator', () => ({checkoutSessionCoordinator: {create: jest.fn()}}));
jest.mock('../../payment/domain/paymentHandoffCoordinator', () => ({paymentHandoffCoordinator: {prepare: jest.fn(async checkout => ({checkout}))}}));
jest.mock('../../payment/storage/pendingPaymentAttemptStore', () => ({pendingPaymentAttemptStore: {save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined)}}));
jest.mock('../../payment/domain/persistedPaymentRecovery', () => ({recoverPersistedPaymentAttempt: jest.fn(async () => null), clearPersistedPaymentIfTerminal: jest.fn(async () => undefined)}));
jest.mock('../../payment/domain/paymentRecoveryCoordinator', () => ({paymentRecoveryCoordinator: {recover: jest.fn(async () => ({outcome: 'PENDING', checkout: mockCheckout, verification: {status: 'PENDING'}}))}}));
jest.mock('../../payment/gateway/razorpayGateway', () => ({razorpayGateway: {open: jest.fn(async () => ({}))}}));

describe('Cart, then Checkout, then Razorpay', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectorResults.clear();
    mockBeforeRemove = null;
    let cart = cartReducer(undefined, cartActions.snapshotAccepted(mockSnapshot));
    cart = cartReducer(cart, cartActions.addressDependencyChanged({status: 'CURRENT', addressId: mockLocation.addressId}));
    mockState = {cart, auth: {identity: {phoneNumber: null}}};
    // The server empties the cart when it creates a checkout.
    mockDispatch.mockImplementation(async (action: {type?: string}) =>
      action?.type === 'refresh' ? {status: 'APPLIED', snapshot: {...mockSnapshot, lines: []}}
        : action?.type === 'add' ? {status: 'APPLIED', snapshot: mockSnapshot} : undefined);
    jest.mocked(checkCartServiceability).mockResolvedValue({serviceable: true, missingKitchenIds: [], dishes: [], estimatedMinutes: 30});
    jest.mocked(cartApi.validate).mockResolvedValue(mockSnapshot);
    jest.mocked(checkoutSessionCoordinator.create).mockResolvedValue(mockCheckout);
    jest.mocked(recoverPersistedPaymentAttempt).mockResolvedValue(null);
  });
  afterEach(() => act(() => tree?.unmount()));
  const render = async () => { await act(async () => { tree = renderer.create(<CustomerCartScreen />); }); };
  const button = (label: string) => tree.root.findAllByType(Button).find(node => node.props.label === label);
  const press = async (label: string) => { await act(async () => { await button(label)!.props.onPress(); }); };
  const shows = (text: string) => tree.root.findAllByType(Text).some(node => node.props.children === text);

  it('shows the bill only after Proceed to Checkout and pays on the second tap', async () => {
    await render();
    expect(button('Proceed to Checkout')!.props.disabled).toBe(false);
    expect(shows('To pay')).toBe(false);
    await press('Proceed to Checkout');
    expect(cartApi.validate).toHaveBeenCalledTimes(1);
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    expect(razorpayGateway.open).not.toHaveBeenCalled();
    expect(shows('To pay')).toBe(true);
    await press('Continue to Payment');
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    expect(razorpayGateway.open).toHaveBeenCalledTimes(1);
  });
  it('explains a refused checkout while a delete request is open instead of the raw error', async () => {
    jest.mocked(checkoutSessionCoordinator.create).mockRejectedValueOnce(
      new AppApiError('ACCOUNT_DELETION_PENDING', 'That information changed.', 409),
    );
    await render();
    await press('Proceed to Checkout');
    expect(tree.root.findAllByType(DeletionPausedNotice).map(node => node.props.kind)).toEqual(['orders']);
    expect(tree.root.findAllByType(RecoverableErrorBanner)).toHaveLength(0);
    // Trying again clears the notice, so Keep my account then Proceed works.
    await press('Proceed to Checkout');
    expect(tree.root.findAllByType(DeletionPausedNotice)).toHaveLength(0);
    expect(button('Continue to Payment')).toBeDefined();
  });
  it('still shows any other checkout failure as the plain error', async () => {
    jest.mocked(checkoutSessionCoordinator.create).mockRejectedValueOnce(new Error('Checkout could not be started.'));
    await render();
    await press('Proceed to Checkout');
    expect(tree.root.findAllByType(DeletionPausedNotice)).toHaveLength(0);
    expect(tree.root.findAllByType(RecoverableErrorBanner)).toHaveLength(1);
  });
  it('does not create duplicate checkouts for rapid presses', async () => {
    let release!: (checkout: CheckoutSession) => void;
    jest.mocked(checkoutSessionCoordinator.create).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await render();
    const proceed = button('Proceed to Checkout')!.props.onPress;
    let first!: Promise<void>;
    await act(async () => { first = proceed(); await proceed(); });
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    await act(async () => { release(mockCheckout); await first; });
    expect(button('Continue to Payment')).toBeDefined();
  });
  it('stays on the cart when server catalog pricing changed', async () => {
    jest.mocked(cartApi.validate).mockResolvedValueOnce({...mockSnapshot, totals: {foodSubtotal: money('90.00')}});
    await render();
    await press('Proceed to Checkout');
    expect(checkoutSessionCoordinator.create).not.toHaveBeenCalled();
    expect(button('Proceed to Checkout')).toBeDefined();
  });
  it('blocks Proceed when the address is outside the delivery area', async () => {
    jest.mocked(checkCartServiceability).mockResolvedValue({serviceable: false, missingKitchenIds: [], dishes: [], estimatedMinutes: null});
    await render();
    expect(button('Proceed to Checkout')!.props.disabled).toBe(true);
  });
  it('replaces an unpaid payment for an older cart instead of looping on its status', async () => {
    const olderCheckout = {...mockCheckout, foodSubtotal: money('160.00'), grandTotal: money('211.20')};
    jest.mocked(recoverPersistedPaymentAttempt).mockResolvedValue({outcome: 'PENDING', checkout: olderCheckout, verification: {status: 'PENDING'}} as never);
    // Like the real store: once cleared, recovery finds nothing.
    jest.mocked(pendingPaymentAttemptStore.clear).mockImplementationOnce(async () => { jest.mocked(recoverPersistedPaymentAttempt).mockResolvedValue(null); });
    await render();
    await press('Proceed to Checkout');
    expect(pendingPaymentAttemptStore.clear).toHaveBeenCalled();
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    await press('Continue to Payment');
    expect(razorpayGateway.open).toHaveBeenCalledTimes(1);
  });
  it('going back from Checkout puts the dishes back in the cart', async () => {
    await render();
    await press('Proceed to Checkout');
    const prevented = jest.fn();
    await act(async () => { mockBeforeRemove!({preventDefault: prevented}); await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    expect(prevented).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({type: 'add', command: {menuItemId: mockSnapshot.lines[0].menuItemId, quantity: 1}});
    expect(button('Proceed to Checkout')).toBeDefined();
  });
});
