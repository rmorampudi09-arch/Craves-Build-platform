import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {deriveChefOrderDetailContractModel as mockDeriveChefOrderDetailContractModel} from '../domain/chefOrderDetailModel';
import {ChefNewOrdersScreen} from './ChefNewOrdersScreen';
import {ChefOrderDetailScreen} from './ChefOrderDetailScreen';

const mockOrder: ChefOrderDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  checkoutId: '22222222-2222-4222-8222-222222222222',
  kitchenId: '33333333-3333-4333-8333-333333333333',
  kitchenName: 'Kitchen', status: 'CHEF_ACCEPTANCE_PENDING', currency: 'INR',
  foodSubtotal: 100, platformFee: 0, taxAmount: 5, deliveryFee: 40, grandTotal: 145,
  chefResponseNote: null, prepTimeMinutes: null, deliveryAddress: null, items: [],
  createdAt: '2026-10-01T20:00:00Z', updatedAt: '2026-10-01T20:00:00Z',
};
const mockAccept = jest.fn(async () => mockOrder);
const mockNavigate = jest.fn();
let mockBusy = false;
const mockTabs = {
  pages: {NEW: {items: [mockOrder], page: 1, totalPages: 1, hasNextPage: false}},
  scrollState: {NEW: 0}, tabCounts: {NEW: 1, PREPARING: 0, READY: 0, COMPLETED: 0},
  selectStatus: jest.fn(), setScrollOffset: jest.fn(), setPage: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: require('react-native').View}));
jest.mock('../../chefShell/components/ChefHeader', () => ({ChefHeader: () => null}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({orderTabs: mockTabs, ordersStatus: 'ready', isRefreshing: false, refresh: jest.fn(async () => undefined)}),
}));
jest.mock('../state/useChefNewOrderActions', () => ({
  useChefNewOrderActions: () => ({
    actionStateByOrder: mockBusy ? {[mockOrder.id]: 'accepting'} : {},
    feedback: null, accept: mockAccept, reject: jest.fn(), clearFeedback: jest.fn(),
  }),
}));
jest.mock('../state/useChefOrderDecision', () => ({
  useChefOrderDecision: () => ({action: mockBusy ? 'accept' : null, error: null, accept: mockAccept, reject: jest.fn(), clearError: jest.fn()}),
}));
jest.mock('../state/useChefOrderDetailContract', () => ({
  useChefOrderDetailContract: () => ({
    status: 'ready', data: mockDeriveChefOrderDetailContractModel(mockOrder), isFetching: false, refresh: jest.fn(async () => undefined),
  }),
}));

describe('Chef acceptance without a preparation-time form', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockBusy = false;
    mockAccept.mockResolvedValue(mockOrder);
  });
  afterEach(() => act(() => tree?.unmount()));
  const button = (label: string) => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  const renderDetail = async () => {
    const props = {
      navigation: {navigate: mockNavigate, goBack: jest.fn()},
      route: {key: 'detail', name: 'ChefOrderDetail', params: {orderId: mockOrder.id}},
    } as unknown as NativeStackScreenProps<ChefProductStackParamList, 'ChefOrderDetail'>;
    await act(async () => {tree = renderer.create(<ChefOrderDetailScreen {...props} />);});
  };

  it('accepts directly from the New orders card without opening a time sheet', async () => {
    await act(async () => {tree = renderer.create(<ChefNewOrdersScreen />);});
    const accept = tree.root.findAll(node => node.props.accessibilityLabel?.startsWith('Accept new order') && typeof node.props.onPress === 'function')[0];
    await act(async () => {accept.props.onPress();});
    expect(mockAccept).toHaveBeenCalledWith(mockOrder.id);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Preparation time in minutes')).toHaveLength(0);
  });

  it('accepts directly from order detail and returns to Orders', async () => {
    await renderDetail();
    expect(button('Accept order').props.disabled).toBe(false);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Preparation time in minutes')).toHaveLength(0);
    await act(async () => {await button('Accept order').props.onPress();});
    expect(mockAccept).toHaveBeenCalledWith();
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Orders'});
  });

  it('disables acceptance and rejection while the decision is in flight', async () => {
    mockBusy = true;
    await renderDetail();
    expect(button('Accept order').props.disabled).toBe(true);
    expect(button('Reject order').props.disabled).toBe(true);
  });

  it('does not navigate away or claim success when acceptance fails', async () => {
    mockAccept.mockRejectedValueOnce(new Error('Not accepted'));
    await renderDetail();
    await act(async () => {await button('Accept order').props.onPress();});
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
