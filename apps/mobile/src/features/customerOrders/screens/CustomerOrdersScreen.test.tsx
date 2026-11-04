import React from 'react';
import {AppState} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {PendingDeletion} from '../../accountDeletion/domain/deletionTypes';
import {CustomerOrderCard} from '../components/CustomerOrderCard';
import {CustomerOrdersScreen} from './CustomerOrdersScreen';

let mockPending: PendingDeletion | null = null;
// One object for every render: the screen re-runs an effect when `data` changes identity.
const mockQuery = {
  data: {orders: []},
  error: null,
  isPending: false,
  isRefetching: false,
  isFetching: false,
  refetch: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({navigate: jest.fn(), getParent: () => undefined}),
}));
jest.mock('../../../app/navigation/CustomerBottomNavController', () => ({
  useCustomerBottomNavScroll: () => ({onScroll: jest.fn(), scrollEventThrottle: 16}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: {id: 'identity-1', pendingDeletion: mockPending}}}),
}));
jest.mock('../../../shared/components/ScreenShell', () => ({ScreenShell: 'ScreenShell'}));
jest.mock('../../auth/api/sessionManager', () => ({
  sessionManager: {subscribeInvalidation: () => () => undefined},
}));
jest.mock('../../cart/state/cartRefresh', () => ({refreshCartSnapshot: jest.fn()}));
jest.mock('../../cart/state/cartMutations', () => ({reorderCart: jest.fn()}));
jest.mock('../../customerEmptyStates/components/CustomerEmptyState', () => ({CustomerEmptyState: () => null}));
jest.mock('../../notifications/components/CustomerBellButton', () => ({CustomerBellButton: () => null}));
jest.mock('../components/CustomerOrderCard', () => ({CustomerOrderCard: jest.fn(() => null)}));
jest.mock('../presentation/customerOrdersPresentation', () => ({
  ...jest.requireActual('../presentation/customerOrdersPresentation'),
  selectCustomerOrdersTab: () => [{id: 'order-1', kitchenId: 'kitchen-1', status: 'DELIVERED'}],
}));
jest.mock('../query/customerOrdersQueries', () => ({useCustomerOrdersQuery: () => mockQuery}));

const pendingOf = (scope: PendingDeletion['scope'], status: PendingDeletion['status'] = 'SCHEDULED'): PendingDeletion => ({
  requestId: 'request-1',
  scope,
  status,
  dueAt: '2026-12-05T12:00:00Z',
});

describe('CustomerOrdersScreen reorder', () => {
  let tree: renderer.ReactTestRenderer;
  const originalAppState = AppState.currentState;
  beforeEach(() => {
    AppState.currentState = 'active';
  });
  afterEach(() => {
    AppState.currentState = originalAppState;
    act(() => tree.unmount());
  });
  const reorderDisabled = async (pending: PendingDeletion | null) => {
    mockPending = pending;
    jest.mocked(CustomerOrderCard).mockClear();
    await act(async () => {
      tree = renderer.create(<CustomerOrdersScreen />);
    });
    return jest.mocked(CustomerOrderCard).mock.calls.at(-1)![0].reorderDisabled;
  };

  it('is on without a delete request', async () => {
    expect(await reorderDisabled(null)).toBe(false);
  });

  it.each(['ALL', 'CUSTOMER'] as const)('is off while a %s delete request is open', async scope => {
    expect(await reorderDisabled(pendingOf(scope))).toBe(true);
  });

  it('is on while only the chef side is being deleted', async () => {
    expect(await reorderDisabled(pendingOf('CHEF'))).toBe(false);
  });
});
