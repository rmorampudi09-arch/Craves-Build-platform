import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerOrderDetailScreen} from './CustomerOrderDetailScreen';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import type {CustomerOrderTracking} from '../domain/customerOrderTrackingTypes';

const money = (amount: string) => ({amount, currency: 'INR'});
const mockOrder: CustomerOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  checkoutId: '22222222-2222-4222-8222-222222222222',
  kitchenId: '44444444-4444-4444-8444-444444444444',
  kitchenName: 'Home Kitchen',
  status: 'OUT_FOR_DELIVERY',
  currency: 'INR',
  foodSubtotal: money('180'),
  platformFee: money('10'),
  taxAmount: money('9'),
  deliveryFee: money('30'),
  grandTotal: money('229'),
  chefResponseNote: null,
  prepTimeMinutes: 25,
  deliveryAddress: null,
  items: [],
  createdAt: '2026-08-08T12:00:00Z',
  updatedAt: '2026-08-08T12:05:00Z',
};
const mockTracking: CustomerOrderTracking = {
  orderId: mockOrder.id,
  deliveryJobId: null,
  providerId: 'craves_fleet',
  status: 'IN_TRANSIT',
  trackingUrl: null,
  observedAt: '2026-08-08T12:10:00Z',
  history: [],
  courierLocation: null,
  deliveryCode: '4821',
  routePath: null,
};
let mockOrderNow: CustomerOrder;
let mockTrackingNow: CustomerOrderTracking;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn(), navigate: jest.fn()}),
  useRoute: () => ({params: {orderId: '11111111-1111-4111-8111-111111111111'}}),
  useIsFocused: () => true,
}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => null}));
jest.mock('../../../shared/components/ScreenShell', () => ({ScreenShell: 'ScreenShell'}));
jest.mock('../components/OrderMap', () => ({OrderMap: 'OrderMap'}));
jest.mock('../components/CustomerOrderMenuItemImage', () => ({CustomerOrderMenuItemImage: () => null}));
jest.mock('../../customerShell/components/CustomerChefAvatar', () => ({CustomerChefAvatar: () => null}));
jest.mock('../query/customerOrderCatalogQueries', () => ({useCustomerOrderKitchenPresentationQuery: () => ({data: undefined})}));
jest.mock('../query/customerOrdersQueries', () => ({
  useCustomerOrderDetailQuery: () => ({data: mockOrderNow, refetch: jest.fn()}),
  useCustomerOrderTrackingQuery: () => ({data: mockTrackingNow, refetch: jest.fn()}),
}));
jest.mock('../../checkout/api/checkoutApi', () => ({checkoutApi: {}}));
jest.mock('../../payment/domain/paymentHandoffCoordinator', () => ({paymentHandoffCoordinator: {}}));
jest.mock('../../payment/domain/persistedPaymentRecovery', () => ({}));
jest.mock('../../payment/domain/paymentRecoveryCoordinator', () => ({paymentRecoveryCoordinator: {}}));
jest.mock('../../payment/gateway/razorpayGateway', () => ({razorpayGateway: {}}));
jest.mock('../../payment/storage/pendingPaymentAttemptStore', () => ({pendingPaymentAttemptStore: {}}));
jest.mock('../../../shared/sound/appSounds', () => ({appSounds: {orderStatusSeen: jest.fn()}}));

describe('Customer order details, delivery code', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    mockOrderNow = mockOrder;
    mockTrackingNow = mockTracking;
  });
  afterEach(() => act(() => tree?.unmount()));
  const texts = () =>
    tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
  const render = () => act(() => { tree = renderer.create(<CustomerOrderDetailScreen />); });

  it('shows the code and what to do with it while the order is out for delivery', () => {
    render();
    expect(texts()).toContain('Delivery code 4821');
    expect(texts()).toContain('Share this code with your rider when your food arrives.');
  });

  it('shows no code when the server sends none or the order is delivered', () => {
    mockTrackingNow = {...mockTracking, deliveryCode: null};
    render();
    expect(texts().some(text => text.startsWith('Delivery code'))).toBe(false);
    act(() => tree.unmount());

    mockTrackingNow = mockTracking;
    mockOrderNow = {...mockOrder, status: 'DELIVERED'};
    render();
    expect(texts().some(text => text.startsWith('Delivery code'))).toBe(false);
  });
});
