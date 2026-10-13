import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {useChefPreparingOrderActions, type ChefPreparingOrderActions} from './useChefPreparingOrderActions';

const mockGetOrder = jest.fn();
const mockMarkReady = jest.fn();
const mockOperational = {refresh: jest.fn(async () => undefined), reconcileOrderStatus: jest.fn()};
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({useChefOperationalState: () => mockOperational}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../api/chefOrderDetailApi', () => ({
  chefOrderDetailApi: {
    getOrder: (id: string) => mockGetOrder(id),
    markReadyForPickup: (id: string) => mockMarkReady(id),
  },
}));

const preparing = {id: 'order-id', status: 'PREPARING', prepTimeMinutes: 20, updatedAt: '2026-10-01T20:05:00Z'} as ChefOrderDetail;

describe('Preparing order actions feedback', () => {
  let tree: renderer.ReactTestRenderer;
  let actions: ChefPreparingOrderActions;
  function Harness() {
    actions = useChefPreparingOrderActions();
    return null;
  }

  afterEach(() => act(() => tree?.unmount()));

  it('still shows the result as a toast when the chef switched filters (the screen is gone) while the request ran', async () => {
    let leave: () => void = () => undefined;
    function Host() {
      const [shown, setShown] = React.useState(true);
      leave = () => setShown(false);
      return (
        <QueryClientProvider client={new QueryClient()}>
          <ChefToastProvider>{shown ? <Harness /> : null}</ChefToastProvider>
        </QueryClientProvider>
      );
    }
    await act(async () => {
      tree = renderer.create(<Host />);
    });
    mockGetOrder.mockResolvedValue(preparing);
    let finish: (value: unknown) => void = () => undefined;
    mockMarkReady.mockReturnValue(new Promise(resolve => (finish = resolve)));
    let request: Promise<unknown> = Promise.resolve();
    await act(async () => {
      request = actions.markReady('order-id');
    });
    act(() => leave());
    await act(async () => {
      finish({...preparing, status: 'READY_FOR_PICKUP'});
      await request;
    });
    const shown = tree.root.findAllByType(Text).map(node => String(node.props.children));
    expect(shown).toContain('Order marked ready for pickup.');
  });
});
