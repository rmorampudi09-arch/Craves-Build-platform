import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {ChefOrderDecisionConflictError} from '../domain/chefOrderDecision';
import {useChefOrderDecision, type ChefOrderDecisionState} from './useChefOrderDecision';

const mockExecute = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockReconcile = jest.fn();
const mockCache = jest.fn();
const mockOperational = {refresh: mockRefresh, reconcileOrderStatus: mockReconcile};
const mockQueryClient = {setQueryData: mockCache};
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'chef-identity'}));
jest.mock('@tanstack/react-query', () => ({useQueryClient: () => mockQueryClient}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({useChefOperationalState: () => mockOperational}));
jest.mock('../domain/chefOrderDecision', () => ({
  ...jest.requireActual('../domain/chefOrderDecision'),
  createChefOrderDecisionCoordinator: () => ({execute: mockExecute}),
}));
jest.mock('./useChefOrderDetailContract', () => ({createChefOrderDetailQueryKey: (identity: string, id: string) => [identity, id]}));

const accepted = {
  id: 'order-id', status: 'CHEF_ACCEPTED', prepTimeMinutes: 25, updatedAt: '2026-10-01T20:05:00Z',
} as ChefOrderDetail;

describe('Chef decision reconciliation', () => {
  let tree: renderer.ReactTestRenderer;
  let state: ChefOrderDecisionState;
  function Harness() {state = useChefOrderDecision('order-id'); return null;}
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue({order: accepted, idempotencyKey: 'same-revision'});
    await act(async () => {tree = renderer.create(<Harness />);});
  });
  afterEach(() => act(() => tree?.unmount()));

  it('keeps successful acceptance successful if the follow-up list refresh fails', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async () => {expect(await state.accept()).toBe(accepted);});
    expect(mockExecute).toHaveBeenCalledWith({kind: 'accept', orderId: 'order-id'});
    expect(mockReconcile).toHaveBeenCalledWith('order-id', 'CHEF_ACCEPTED', accepted.updatedAt, 25);
    expect(mockCache).toHaveBeenCalled();
    expect(state.error).toBeNull();
    expect(state.action).toBeNull();
  });

  it('blocks rapid accept/reject presses until the first decision finishes', async () => {
    let release!: (value: {order: ChefOrderDetail; idempotencyKey: string}) => void;
    mockExecute.mockImplementationOnce(() => new Promise(resolve => {release = resolve;}));
    let pending!: Promise<ChefOrderDetail>;
    await act(async () => {
      pending = state.accept();
      await expect(state.reject('Unavailable')).rejects.toMatchObject({code: 'CHEF_ORDER_DECISION_IN_PROGRESS'});
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(state.action).toBe('accept');
    await act(async () => {release({order: accepted, idempotencyKey: 'same-revision'}); await pending;});
    expect(state.action).toBeNull();
  });

  it('preserves a real permission failure and releases the retry guard', async () => {
    const failure = new AppApiError('FORBIDDEN', 'Not available for this account', 403);
    mockExecute.mockRejectedValueOnce(failure);
    await act(async () => {await expect(state.accept()).rejects.toBe(failure);});
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(state.error).toBe(failure);
    expect(state.action).toBeNull();
    await act(async () => {await state.accept();});
    expect(state.error).toBeNull();
  });

  it('reconciles an order already decided elsewhere even if the refresh fails', async () => {
    mockExecute.mockRejectedValueOnce(new ChefOrderDecisionConflictError(accepted));
    mockRefresh.mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async () => {await expect(state.accept()).rejects.toMatchObject({code: 'CHEF_ORDER_NOT_ACTIONABLE'});});
    expect(mockReconcile).toHaveBeenCalledWith('order-id', 'CHEF_ACCEPTED', accepted.updatedAt, 25);
    expect(state.error?.status).toBe(409);
  });
});
