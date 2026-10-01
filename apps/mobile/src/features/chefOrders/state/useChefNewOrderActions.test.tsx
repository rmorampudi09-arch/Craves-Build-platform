import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {useChefNewOrderActions, type ChefNewOrderActionsState} from './useChefNewOrderActions';

const mockExecute = jest.fn();
const mockGetOrder = jest.fn();
const mockReconcile = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockOperational = {refresh: mockRefresh, reconcileOrderStatus: mockReconcile};
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({useChefOperationalState: () => mockOperational}));
jest.mock('../domain/chefOrderDecision', () => ({
  ...jest.requireActual('../domain/chefOrderDecision'),
  createChefOrderDecisionCoordinator: () => ({execute: mockExecute}),
}));
jest.mock('../api/chefOrderDetailApi', () => ({chefOrderDetailApi: {getOrder: (id: string) => mockGetOrder(id)}}));

const pending = {id: 'order-id', status: 'CHEF_ACCEPTANCE_PENDING', prepTimeMinutes: null, updatedAt: '2026-10-01T20:05:00Z'} as ChefOrderDetail;

describe('New order acceptance feedback', () => {
  let tree: renderer.ReactTestRenderer;
  let state: ChefNewOrderActionsState;
  function Harness() {state = useChefNewOrderActions(); return null;}
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
    await act(async () => {tree = renderer.create(<Harness />);});
  });
  afterEach(() => act(() => tree?.unmount()));

  it('keeps the server expiry message when the stored status is still pending', async () => {
    const failure = new AppApiError('CHEF_ACCEPTANCE_EXPIRED', 'The 30-minute chef acceptance window has expired.', 409);
    mockExecute.mockRejectedValueOnce(failure);
    mockGetOrder.mockResolvedValueOnce(pending);
    await act(async () => {await expect(state.accept('order-id')).rejects.toBe(failure);});
    expect(state.feedback).toEqual({kind: 'error', message: failure.message});
    expect(mockGetOrder).toHaveBeenCalledWith('order-id');
    expect(state.actionStateByOrder['order-id']).toBeUndefined();
  });

  it('shows and reconciles an actual status change on conflict', async () => {
    mockExecute.mockRejectedValueOnce(new AppApiError('CONFLICT', 'Order changed', 409));
    mockGetOrder.mockResolvedValueOnce({...pending, status: 'CHEF_ACCEPTED', prepTimeMinutes: 25});
    await act(async () => {await expect(state.accept('order-id')).rejects.toMatchObject({status: 409});});
    expect(state.feedback?.message).toContain('Chef Accepted');
    expect(mockReconcile).toHaveBeenCalledWith('order-id', 'CHEF_ACCEPTED', pending.updatedAt, 25);
  });

  it('does not report failure after a successful acceptance if refresh fails', async () => {
    const accepted = {...pending, status: 'CHEF_ACCEPTED' as const, prepTimeMinutes: 25};
    mockExecute.mockResolvedValueOnce({order: accepted});
    mockRefresh.mockRejectedValueOnce(new Error('Refresh unavailable'));
    await act(async () => {expect(await state.accept('order-id')).toBe(accepted);});
    expect(state.feedback?.kind).toBe('success');
    expect(state.actionStateByOrder['order-id']).toBeUndefined();
  });
});
