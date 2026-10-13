import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {isPrivateQueryKey, matchesPrivateQueryScope} from '../../../app/query/queryKeys';
import {chefSubscriptionApi} from '../api/chefSubscriptionApi';
import {
  chefMealPlansQueryPrefix,
  createChefMealPlanQueryKey,
  useChefCapacityQuery,
  useChefMealPlanSchedulesQuery,
  useChefMealPlansQuery,
  useSetAcceptingSubscribers,
} from './chefMealPlanQueries';

let mockIdentityId: string | null = 'chef-1';
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: mockIdentityId ? {id: mockIdentityId} : null}}),
}));
jest.mock('../api/chefSubscriptionApi', () => ({
  chefSubscriptionApi: {
    listPlans: jest.fn(),
    getSchedule: jest.fn(),
    getCapacity: jest.fn(),
    setAcceptingSubscribers: jest.fn(),
  },
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const plan = {id: PLAN_ID, name: 'Weekly Lunch', status: 'ACTIVE', acceptingSubscribers: true};
const schedule = {planId: PLAN_ID, items: []};
const get = (mock: unknown) => mock as jest.Mock;

function newClient() {
  return new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    });
  }
}

async function renderHook<T>(hook: () => T, queryClient = newClient()) {
  const result: {current: T} = {current: undefined as T};
  function Probe() {
    result.current = hook();
    return null;
  }
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await settle();
  return {result, queryClient};
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentityId = 'chef-1';
  get(chefSubscriptionApi.listPlans).mockResolvedValue([plan]);
  get(chefSubscriptionApi.getSchedule).mockResolvedValue(schedule);
});

describe('chef meal plan query keys', () => {
  it('are private, chef-scoped and under the chef-meal-plans prefix', () => {
    const key = createChefMealPlanQueryKey('chef-1', 'schedule', PLAN_ID);

    expect(isPrivateQueryKey(key)).toBe(true);
    expect(matchesPrivateQueryScope(key, {userId: 'chef-1', role: 'CHEF'})).toBe(true);
    expect(matchesPrivateQueryScope(key, {userId: 'chef-2'})).toBe(false);
    expect(key.slice(0, chefMealPlansQueryPrefix.length)).toEqual([...chefMealPlansQueryPrefix]);
  });
});

describe('useChefMealPlansQuery', () => {
  it('loads the chef plans', async () => {
    const {result} = await renderHook(() => useChefMealPlansQuery());

    expect(result.current.data).toEqual([plan]);
  });

  it('does not fetch while signed out', async () => {
    mockIdentityId = null;
    await renderHook(() => useChefMealPlansQuery());

    expect(chefSubscriptionApi.listPlans).not.toHaveBeenCalled();
  });
});

describe('useChefMealPlanSchedulesQuery', () => {
  it('loads each plan schedule keyed by plan id', async () => {
    const {result} = await renderHook(() => useChefMealPlanSchedulesQuery([PLAN_ID]));

    expect(result.current).toEqual({[PLAN_ID]: schedule});
    expect(chefSubscriptionApi.getSchedule).toHaveBeenCalledWith(PLAN_ID, expect.anything());
  });

  it('leaves a plan out when its schedule fails to load', async () => {
    get(chefSubscriptionApi.getSchedule).mockRejectedValue(new Error('500'));
    const {result} = await renderHook(() => useChefMealPlanSchedulesQuery([PLAN_ID]));

    expect(result.current).toEqual({[PLAN_ID]: undefined});
  });
});

describe('useChefCapacityQuery', () => {
  const capacity = {adminSalesFrozen: false, slotRules: [], menuItemRules: [], dateOverrides: [], menuItemDateOverrides: []};

  it('loads the chef capacity once, under the chef-meal-plans prefix so a save refreshes it', async () => {
    get(chefSubscriptionApi.getCapacity).mockResolvedValue(capacity);
    const queryClient = newClient();
    const {result} = await renderHook(() => useChefCapacityQuery(), queryClient);

    expect(result.current.data).toEqual(capacity);
    expect(queryClient.getQueryData(createChefMealPlanQueryKey('chef-1', 'capacity'))).toEqual(capacity);
  });

  it('does not fetch while signed out, and keeps the error so the screen can tell a missing route from a failure', async () => {
    mockIdentityId = null;
    await renderHook(() => useChefCapacityQuery());
    expect(chefSubscriptionApi.getCapacity).not.toHaveBeenCalled();

    mockIdentityId = 'chef-1';
    get(chefSubscriptionApi.getCapacity).mockRejectedValue(new Error('404'));
    const {result} = await renderHook(() => useChefCapacityQuery());
    expect(result.current.error).toEqual(new Error('404'));
  });
});

describe('useSetAcceptingSubscribers', () => {
  it('writes the returned plan into the cached list', async () => {
    get(chefSubscriptionApi.setAcceptingSubscribers).mockResolvedValue({
      ...plan,
      acceptingSubscribers: false,
    });
    const queryClient = newClient();
    queryClient.setQueryData(createChefMealPlanQueryKey('chef-1', 'plans'), [plan]);
    const {result} = await renderHook(() => useSetAcceptingSubscribers(), queryClient);

    await act(async () => {
      await result.current(PLAN_ID, false);
    });

    expect(chefSubscriptionApi.setAcceptingSubscribers).toHaveBeenCalledWith(PLAN_ID, false);
    expect(queryClient.getQueryData(createChefMealPlanQueryKey('chef-1', 'plans'))).toEqual([
      {...plan, acceptingSubscribers: false},
    ]);
  });

  it('rejects with the server error and leaves the cached plan alone', async () => {
    get(chefSubscriptionApi.setAcceptingSubscribers).mockRejectedValue(new Error('409'));
    const queryClient = newClient();
    queryClient.setQueryData(createChefMealPlanQueryKey('chef-1', 'plans'), [plan]);
    const {result} = await renderHook(() => useSetAcceptingSubscribers(), queryClient);

    await expect(
      act(async () => {
        await result.current(PLAN_ID, false);
      }),
    ).rejects.toThrow('409');
    expect(queryClient.getQueryData(createChefMealPlanQueryKey('chef-1', 'plans'))).toEqual([plan]);
  });
});
