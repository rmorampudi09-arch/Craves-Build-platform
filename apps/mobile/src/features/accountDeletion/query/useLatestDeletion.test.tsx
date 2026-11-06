import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {accountDeletionApi} from '../api/accountDeletionApi';
import type {DeletionView} from '../domain/deletionTypes';
import {accountDeletionQueryKey} from './accountDeletionQueryKey';
import {useLatestDeletion} from './useLatestDeletion';

let mockIdentityId: string | undefined;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: mockIdentityId ? {id: mockIdentityId} : null}}),
}));
jest.mock('../api/accountDeletionApi', () => ({accountDeletionApi: {getLatest: jest.fn()}}));

const getLatest = accountDeletionApi.getLatest as jest.Mock;

const view: DeletionView = {
  requestId: 'request-1',
  scope: 'CHEF',
  status: 'SCHEDULED',
  requestedAt: '2026-11-05T08:00:00Z',
  dueAt: '2026-12-05T08:00:00Z',
  reviewNote: null,
};

let queryClient: QueryClient;
let tree: renderer.ReactTestRenderer;
let result: ReturnType<typeof useLatestDeletion>;

function Probe() {
  result = useLatestDeletion();
  return null;
}

// react-query hands its result to React on the next timer tick.
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await settle();
}

describe('useLatestDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdentityId = 'identity-1';
    queryClient = new QueryClient();
  });
  afterEach(() => {
    act(() => tree.unmount());
    queryClient.clear();
  });

  it('hides the row while the first answer is on its way', async () => {
    getLatest.mockReturnValue(new Promise(() => undefined));
    await mount();
    expect(result).toMatchObject({latest: null, showRow: false, status: 'pending'});
  });

  it('shows the row and returns the request when the server has one', async () => {
    getLatest.mockResolvedValue(view);
    await mount();
    expect(result).toMatchObject({latest: view, showRow: true, status: 'success'});
    expect(queryClient.getQueryData(accountDeletionQueryKey('identity-1'))).toEqual(view);
  });

  it('shows the row when the person never asked to delete', async () => {
    getLatest.mockResolvedValue(null);
    await mount();
    expect(result).toMatchObject({latest: null, showRow: true, status: 'success'});
  });

  it('shows the row for a 404 that says there is no request', async () => {
    getLatest.mockRejectedValue(new AppApiError('NO_DELETION_REQUEST', 'None', 404));
    await mount();
    expect(result).toMatchObject({showRow: true, status: 'error'});
  });

  it.each([
    ['a 503', new AppApiError('HTTP_503', 'Unavailable', 503)],
    ['a 404 with another code', new AppApiError('NOT_FOUND', 'Not found', 404)],
    ['no network', new AppApiError('NETWORK_ERROR', 'Offline')],
  ])('hides the row after %s, so a switched-off server shows nothing', async (_name, error) => {
    getLatest.mockRejectedValue(error);
    await mount();
    expect(result).toMatchObject({latest: null, showRow: false, status: 'error'});
    expect(getLatest).toHaveBeenCalledTimes(1);
  });

  it('drops the old request and hides the row when a later refresh fails', async () => {
    getLatest.mockResolvedValueOnce(view);
    await mount();
    expect(result).toMatchObject({latest: view, showRow: true});
    getLatest.mockRejectedValueOnce(new AppApiError('HTTP_503', 'Unavailable', 503));
    await act(async () => result.refetch());
    await settle();
    expect(result).toMatchObject({latest: null, showRow: false, status: 'error'});
  });

  it('asks once on mount, and again on refetch', async () => {
    getLatest.mockResolvedValue(view);
    await mount();
    expect(getLatest).toHaveBeenCalledTimes(1);
    await act(async () => result.refetch());
    expect(getLatest).toHaveBeenCalledTimes(2);
  });

  it('does not ask while nobody is signed in', async () => {
    mockIdentityId = undefined;
    await mount();
    expect(getLatest).not.toHaveBeenCalled();
    expect(result).toMatchObject({showRow: false, status: 'pending'});
  });
});
