import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Modal, ScrollView, StyleSheet} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {AppApiError} from '../../../core/http/apiError';
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
const mockReject = jest.fn(async (): Promise<ChefOrderDetail> => ({...mockOrder, status: 'CHEF_REJECTED'}));
const mockNavigate = jest.fn();
let mockBusy = false;
let mockRejecting = false;
let mockError: AppApiError | null = null;
let mockFeedback: {kind: 'error'; message: string} | null = null;
const mockTabs = {
  pages: {NEW: {items: [mockOrder], page: 1, totalPages: 1, hasNextPage: false}},
  scrollState: {NEW: 0}, tabCounts: {NEW: 1, PREPARING: 0, READY: 0, COMPLETED: 0},
  selectStatus: jest.fn(), setScrollOffset: jest.fn(), setPage: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../chefShell/components/ChefHeader', () => ({ChefHeader: () => null}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({orderTabs: mockTabs, ordersStatus: 'ready', isRefreshing: false, refresh: jest.fn(async () => undefined)}),
}));
jest.mock('../state/useChefNewOrderActions', () => ({
  useChefNewOrderActions: () => ({
    actionStateByOrder: mockBusy ? {[mockOrder.id]: mockRejecting ? 'rejecting' : 'accepting'} : {},
    feedback: mockFeedback, accept: mockAccept, reject: mockReject, clearFeedback: jest.fn(),
  }),
}));
jest.mock('../state/useChefOrderDecision', () => ({
  useChefOrderDecision: () => ({action: mockBusy ? mockRejecting ? 'reject' : 'accept' : null, error: mockError, accept: mockAccept, reject: mockReject, clearError: jest.fn()}),
}));
jest.mock('../state/useChefOrderDetailContract', () => ({
  useChefOrderDetailContract: () => ({
    status: 'ready', data: mockDeriveChefOrderDetailContractModel(mockOrder), isFetching: false, refresh: jest.fn(async () => undefined),
  }),
}));

describe('Chef order decision screens', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockBusy = false;
    mockRejecting = false;
    mockError = null;
    mockFeedback = null;
    mockAccept.mockResolvedValue(mockOrder);
    mockReject.mockResolvedValue({...mockOrder, status: 'CHEF_REJECTED'});
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

  describe.each(['list', 'detail'] as const)('rejection from %s', entry => {
    const modal = () => tree.root.findByType(Modal);
    const reasonInput = () => tree.root.findAll(node => node.props.accessibilityLabel === 'Rejection reason' && typeof node.props.onChangeText === 'function')[0];
    const open = async () => {
      if (entry === 'detail') {
        await renderDetail();
        await act(async () => {button('Reject order').props.onPress();});
      } else {
        await act(async () => {tree = renderer.create(<ChefNewOrdersScreen />);});
        const reject = tree.root.findAll(node => node.props.accessibilityLabel?.startsWith('Reject new order') && typeof node.props.onPress === 'function')[0];
        await act(async () => {reject.props.onPress();});
      }
    };

    it('opens a bounded reason field with confirmation outside the scrollable body', async () => {
      await open();
      expect(modal().props.visible).toBe(true);
      const inputStyle = StyleSheet.flatten(reasonInput().props.style);
      expect(inputStyle.height).toBe(112);
      expect(inputStyle.flex).toBeUndefined();
      expect(reasonInput().props.maxLength).toBe(500);
      const body = tree.root.findAllByType(ScrollView).find(node => node.props.keyboardShouldPersistTaps === 'handled');
      expect(body).toBeDefined();
      expect(body?.findAll(node => node.props.accessibilityLabel === 'Confirm reject order')).toHaveLength(0);
      expect(button('Confirm reject order').props.disabled).toBe(true);
      let parent = button('Confirm reject order').parent;
      while (parent && StyleSheet.flatten(parent.props.style)?.maxHeight !== '100%') {
        parent = parent.parent;
      }
      expect(StyleSheet.flatten(parent?.props.style)).toMatchObject({maxHeight: '100%', paddingBottom: 34});
    });

    it('does not send a rejection when cancelled or when the reason is blank', async () => {
      await open();
      await act(async () => {reasonInput().props.onChangeText('   ');});
      expect(button('Confirm reject order').props.disabled).toBe(true);
      await act(async () => {button('Confirm reject order').props.onPress();});
      expect(mockReject).not.toHaveBeenCalled();
      await act(async () => {button('Cancel rejecting order').props.onPress();});
      expect(modal().props.visible).toBe(false);
      expect(mockReject).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('submits the reason and closes only after server success', async () => {
      await open();
      await act(async () => {reasonInput().props.onChangeText('  Kitchen unavailable  ');});
      expect(button('Confirm reject order').props.disabled).toBe(false);
      let resolve!: (order: ChefOrderDetail) => void;
      mockReject.mockImplementationOnce(() => new Promise<ChefOrderDetail>(done => {resolve = done;}));
      let submission: Promise<void> | undefined;
      await act(async () => {submission = button('Confirm reject order').props.onPress();});
      expect(mockReject).toHaveBeenCalledTimes(1);
      expect(mockReject).toHaveBeenCalledWith(...(entry === 'list' ? [mockOrder.id, 'Kitchen unavailable'] : ['Kitchen unavailable']));
      expect(modal().props.visible).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
      await act(async () => {
        resolve({...mockOrder, status: 'CHEF_REJECTED'});
        await submission;
      });
      expect(modal().props.visible).toBe(false);
      if (entry === 'detail') {
        expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Orders'});
      } else {
        expect(mockNavigate).not.toHaveBeenCalled();
      }
    });

    it('keeps the form and the server error visible on rejection failure', async () => {
      await open();
      await act(async () => {reasonInput().props.onChangeText('Kitchen unavailable');});
      const failure = new AppApiError('FORBIDDEN', 'This action is not available for your account.', 403);
      mockReject.mockImplementationOnce(async () => {
        mockError = failure;
        mockFeedback = {kind: 'error', message: failure.message};
        throw failure;
      });
      await act(async () => {await button('Confirm reject order').props.onPress();});
      // Render the error exposed by the mocked hook after its rejected request.
      await act(async () => {reasonInput().props.onChangeText('Kitchen unavailable ');});
      expect(modal().props.visible).toBe(true);
      expect(reasonInput().props.value).toBe('Kitchen unavailable ');
      const body = tree.root.findAllByType(ScrollView).find(node => node.props.keyboardShouldPersistTaps === 'handled');
      expect(body?.findAll(node => node.props.children === failure.message).length).toBeGreaterThan(0);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('prevents closing or submitting twice while a rejection is in flight', async () => {
      await open();
      await act(async () => {reasonInput().props.onChangeText('Kitchen unavailable');});
      mockBusy = true;
      mockRejecting = true;
      await act(async () => {reasonInput().props.onChangeText('Kitchen temporarily unavailable');});
      expect(reasonInput().props.editable).toBe(false);
      expect(button('Confirm reject order').props.disabled).toBe(true);
      expect(button('Cancel rejecting order').props.disabled).toBe(true);
      await act(async () => {modal().props.onRequestClose();});
      expect(modal().props.visible).toBe(true);
      await act(async () => {button('Confirm reject order').props.onPress();});
      expect(mockReject).not.toHaveBeenCalled();
    });
  });
});
