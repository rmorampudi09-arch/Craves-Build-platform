import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {chefHandedOverRoute, HANDED_OVER_FAILED, useChefHandedOver, type ChefHandedOver} from './useChefHandedOver';

const mockHandedOver = jest.fn();
const mockReconcile = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
jest.mock('../api/chefOrderDetailApi', () => ({
  ...jest.requireActual('../api/chefOrderDetailApi'),
  chefOrderDetailApi: {handedOver: (...args: unknown[]) => mockHandedOver(...args)},
}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({reconcileOrderStatus: mockReconcile, refresh: mockRefresh}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));

const ORDER_ID = '00000000-0000-4000-8000-00000000e7cd';
const COMING_SOON = 'Handed over is coming soon.';
const updated = {id: ORDER_ID, status: 'READY_FOR_PICKUP', updatedAt: '2026-10-14T07:00:00Z', prepTimeMinutes: 20};

describe('useChefHandedOver', () => {
  let tree: renderer.ReactTestRenderer;
  let hook: ChefHandedOver;
  const mount = () => {
    function Probe() {
      hook = useChefHandedOver();
      return null;
    }
    act(() => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient()}>
          <ChefToastProvider>
            <Probe />
          </ChefToastProvider>
        </QueryClientProvider>,
      );
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    chefHandedOverRoute.missing = false;
    mockHandedOver.mockResolvedValue({...updated, chefHandedOverAt: '2026-10-14T07:00:00Z'});
    mount();
  });
  afterEach(() => act(() => tree.unmount()));

  it('offers Handed over only for an order that can still be handed over', () => {
    expect(hook.canHandOver({id: ORDER_ID, chefHandedOverAt: null})).toBe(true);
    // Absent: the server has no hand-over action. A time: already done.
    expect(hook.canHandOver({id: ORDER_ID})).toBe(false);
    expect(hook.canHandOver({id: ORDER_ID, chefHandedOverAt: '2026-10-14T07:00:00Z'})).toBe(false);
  });

  it('posts the hand-over once, even when pressed twice, then hides the button and refreshes', async () => {
    await act(async () => {
      await Promise.all([hook.handOver(ORDER_ID), hook.handOver(ORDER_ID)]);
    });
    expect(mockHandedOver).toHaveBeenCalledTimes(1);
    expect(mockHandedOver).toHaveBeenCalledWith(ORDER_ID);
    expect(mockReconcile).toHaveBeenCalledWith(ORDER_ID, 'READY_FOR_PICKUP', updated.updatedAt, 20);
    expect(mockRefresh).toHaveBeenCalled();
    expect(hook.canHandOver({id: ORDER_ID, chefHandedOverAt: null})).toBe(false);
    expect(hook.busyOrderId).toBeNull();
  });

  const toastShown = (text: string) => tree.root.findAll(node => node.props.children === text).length > 0;

  it('says "Handed over is coming soon." when the server has no such route, instead of hiding the button without a word', async () => {
    mockHandedOver.mockRejectedValueOnce(new AppApiError('HTTP_404', 'Not found', 404));
    await act(async () => {
      await hook.handOver(ORDER_ID);
    });
    expect(chefHandedOverRoute.missing).toBe(true);
    expect(toastShown(COMING_SOON)).toBe(true);
    expect(toastShown(HANDED_OVER_FAILED)).toBe(false);
    expect(hook.canHandOver({id: ORDER_ID, chefHandedOverAt: null})).toBe(true);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('answers a later tap the same way without asking the server again', async () => {
    chefHandedOverRoute.missing = true;
    await act(async () => {
      await hook.handOver('another-order');
    });
    expect(mockHandedOver).not.toHaveBeenCalled();
    expect(toastShown(COMING_SOON)).toBe(true);
  });

  it('keeps the button and says so plainly when the request fails for another reason', async () => {
    mockHandedOver.mockRejectedValueOnce(new AppApiError('HTTP_500', 'boom', 500));
    await act(async () => {
      await hook.handOver(ORDER_ID);
    });
    expect(chefHandedOverRoute.missing).toBe(false);
    expect(hook.canHandOver({id: ORDER_ID, chefHandedOverAt: null})).toBe(true);
    expect(tree.root.findAll(node => node.props.children === HANDED_OVER_FAILED).length).toBeGreaterThan(0);
  });
});
