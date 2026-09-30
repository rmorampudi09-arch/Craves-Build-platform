import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {CustomerCartScreen} from './CustomerCartScreen';
import {cartReducer, cartActions} from '../state/cartSlice';
import {cartApi} from '../api/cartApi';
import {checkoutSessionCoordinator} from '../../checkout/domain/checkoutSessionCoordinator';
import {razorpayGateway} from '../../payment/gateway/razorpayGateway';
import {Button} from '../../../shared/components/Button';
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
const mockPreview = {
  deliveryAddressId: mockLocation.addressId, policyId: 'policy', policyRevision: 1,
  foodSubtotal: money('80.00'), platformFee: money('0.00'), deliveryFee: money('40.00'),
  taxAmount: money('11.20'), grandTotal: money('131.20'), expiresAt: '2099-01-01T00:00:00Z',
};
const mockCheckout: CheckoutSession = {
  ...mockPreview, checkoutId: 'checkout', customerIdentityId: 'customer', status: 'PAYMENT_PENDING',
  currency: 'INR', chargePolicyId: 'policy', createdAt: '2026-09-30T10:00:00Z',
  orders: [{orderId: 'order', checkoutId: 'checkout', status: 'PAYMENT_PENDING'}],
};
let mockState: {cart: ReturnType<typeof cartReducer>; auth: {identity: {phoneNumber: null}}};
let mockBillAvailable = true;
const mockDispatch = jest.fn();
const mockSelectorResults = new Map<Function, unknown>();

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: typeof mockState) => unknown) => {
    if (!mockSelectorResults.has(select)) mockSelectorResults.set(select, select(mockState));
    return mockSelectorResults.get(select);
  },
  useAppDispatch: () => mockDispatch,
}));
jest.mock('@react-navigation/native', () => ({useNavigation: () => ({goBack: jest.fn(), getParent: () => ({navigate: jest.fn()})})}));
jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, bottom: 24, left: 0, right: 0})}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../shared/components/ScreenShell', () => ({ScreenShell: 'ScreenShell'}));
jest.mock('../../../app/navigation/CustomerBottomNavController', () => ({useCustomerBottomNavScroll: () => ({onScroll: jest.fn(), scrollEventThrottle: 16})}));
jest.mock('../../customerShell/components/CustomerHeader', () => ({CustomerHeader: () => null}));
jest.mock('../../customerShell/components/CustomerLocationSelector', () => ({CustomerLocationSelector: () => null}));
jest.mock('../../customerShell/hooks/useCustomerHeaderState', () => ({useCustomerHeaderState: () => ({selectedLocation: mockLocation})}));
jest.mock('../query/useCartBillPreview', () => ({useCartBillPreview: () => ({preview: mockBillAvailable ? mockPreview : null, available: true, addressId: mockLocation.addressId})}));
jest.mock('../api/cartApi', () => ({cartApi: {validate: jest.fn()}, buildCartSnapshotRequest: jest.fn()}));
jest.mock('../api/cartServiceabilityApi', () => ({checkCartServiceability: jest.fn(async () => ({serviceable: true, dishes: [], estimatedMinutes: 30}))}));
jest.mock('../../checkout/domain/checkoutSessionCoordinator', () => ({checkoutSessionCoordinator: {create: jest.fn()}}));
jest.mock('../../payment/domain/paymentHandoffCoordinator', () => ({paymentHandoffCoordinator: {prepare: jest.fn(async checkout => ({checkout}))}}));
jest.mock('../../payment/storage/pendingPaymentAttemptStore', () => ({pendingPaymentAttemptStore: {save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined)}}));
jest.mock('../../payment/domain/persistedPaymentRecovery', () => ({recoverPersistedPaymentAttempt: jest.fn(async () => null), clearPersistedPaymentIfTerminal: jest.fn(async () => undefined)}));
jest.mock('../../payment/domain/paymentRecoveryCoordinator', () => ({paymentRecoveryCoordinator: {recover: jest.fn(async () => ({outcome: 'PENDING', checkout: mockCheckout, verification: {status: 'PENDING'}}))}}));
jest.mock('../../payment/gateway/razorpayGateway', () => ({razorpayGateway: {open: jest.fn(async () => ({}))}}));

describe('one-tap Cart to Razorpay', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectorResults.clear();
    mockBillAvailable = true;
    let cart = cartReducer(undefined, cartActions.snapshotAccepted(mockSnapshot));
    cart = cartReducer(cart, cartActions.addressDependencyChanged({status: 'CURRENT', addressId: mockLocation.addressId}));
    mockState = {cart, auth: {identity: {phoneNumber: null}}};
    jest.mocked(cartApi.validate).mockResolvedValue(mockSnapshot);
    jest.mocked(checkoutSessionCoordinator.create).mockResolvedValue(mockCheckout);
  });
  afterEach(() => act(() => tree?.unmount()));
  const render = async () => { await act(async () => { tree = renderer.create(<CustomerCartScreen />); }); };
  const button = () => tree.root.findAllByType(Button).find(node => node.props.label === 'Continue to Payment')!;

  it('opens payment on the first press when the displayed bill matches the final bill', async () => {
    await render();
    expect(button().props.disabled).toBe(false);
    await act(async () => { await button().props.onPress(); });
    expect(cartApi.validate).toHaveBeenCalledTimes(1);
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    expect(razorpayGateway.open).toHaveBeenCalledTimes(1);
  });
  it('does not create duplicate checkouts for rapid presses', async () => {
    let release!: (checkout: CheckoutSession) => void;
    jest.mocked(checkoutSessionCoordinator.create).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await render();
    const press = button().props.onPress;
    let first!: Promise<void>;
    await act(async () => { first = press(); await press(); });
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    await act(async () => { release(mockCheckout); await first; });
    expect(razorpayGateway.open).toHaveBeenCalledTimes(1);
  });
  it('requires review only when a fee changed, then reuses the same checkout', async () => {
    jest.mocked(checkoutSessionCoordinator.create).mockResolvedValueOnce({...mockCheckout, deliveryFee: money('50.00'), grandTotal: money('141.20')});
    await render();
    await act(async () => { await button().props.onPress(); });
    expect(razorpayGateway.open).not.toHaveBeenCalled();
    await act(async () => { await button().props.onPress(); });
    expect(checkoutSessionCoordinator.create).toHaveBeenCalledTimes(1);
    expect(razorpayGateway.open).toHaveBeenCalledTimes(1);
  });
  it('stops before checkout when server catalog pricing changed', async () => {
    jest.mocked(cartApi.validate).mockResolvedValueOnce({...mockSnapshot, totals: {foodSubtotal: money('90.00')}});
    await render();
    await act(async () => { await button().props.onPress(); });
    expect(checkoutSessionCoordinator.create).not.toHaveBeenCalled();
    expect(razorpayGateway.open).not.toHaveBeenCalled();
  });
  it('waits for a verified bill before enabling payment', async () => {
    mockBillAvailable = false;
    await render();
    expect(button().props.disabled).toBe(true);
  });
});
