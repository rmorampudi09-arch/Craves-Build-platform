import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {customerSubscriptionApi} from '../api/customerSubscriptionApi';
import {dishDetailApi} from '../../dishDetail/api/dishDetailApi';
import {publicKitchenReviewApi} from '../../kitchenProfile/api/publicKitchenReviewApi';
import {
  mealPlanQueryPrefix,
  usePlanCover,
  useSubscriptionActions,
} from './mealPlanQueries';

jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: {id: 'customer-1'}}}),
}));
jest.mock('../api/customerSubscriptionApi', () => ({
  customerSubscriptionApi: {
    listPlans: jest.fn(),
    getPlanSchedule: jest.fn(),
    pause: jest.fn(),
  },
}));
jest.mock('../../dishDetail/api/dishDetailApi', () => ({
  ...jest.requireActual('../../dishDetail/api/dishDetailApi'),
  dishDetailApi: {getCustomerDishDetail: jest.fn()},
}));
jest.mock('../../kitchenProfile/api/publicKitchenReviewApi', () => ({
  PUBLIC_KITCHEN_REVIEWS_AVAILABLE: true,
  publicKitchenReviewApi: {getSummary: jest.fn()},
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const DISH_ID = '22222222-2222-4222-8222-222222222222';
const KITCHEN_ID = '33333333-3333-4333-8333-333333333333';

const plan = {id: PLAN_ID, name: 'Weekly Lunch', imageUrl: null as string | null};
const scheduleItem = {
  menuItemId: DISH_ID,
  menuItemName: 'Thali',
  menuItemFoodType: 'VEG',
  isoDayOfWeek: 1,
  dayOfMonth: null,
  mealSlotCode: 'LUNCH',
  serviceTime: '12:30:00',
  sequenceNumber: 1,
  quantity: 1,
};
const dish = {
  id: DISH_ID,
  kitchen: {id: KITCHEN_ID, kitchenName: 'Lakshmi Foods', displayName: "Lakshmi's Kitchen"},
  images: [{id: 'i1', url: 'https://img.craves.in/thali.jpg', primary: true, sortOrder: 0}],
};

const get = (mock: unknown) => mock as jest.Mock;

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

beforeEach(() => {
  jest.clearAllMocks();
  get(customerSubscriptionApi.listPlans).mockResolvedValue([plan]);
  get(customerSubscriptionApi.getPlanSchedule).mockResolvedValue({
    planId: PLAN_ID,
    items: [scheduleItem],
  });
  get(dishDetailApi.getCustomerDishDetail).mockResolvedValue(dish);
  get(publicKitchenReviewApi.getSummary).mockResolvedValue({
    reviewCount: 320,
    overallAverage: 4.8,
  });
});

describe('usePlanCover', () => {
  it('falls back to the first dish photo and reads kitchen and rating from it', async () => {
    const {result} = await renderHook(() => usePlanCover(PLAN_ID));

    expect(result.current.imageUrl).toBe('https://img.craves.in/thali.jpg');
    expect(result.current.kitchenName).toBe("Lakshmi's Kitchen");
    expect(result.current.summary?.mealCount).toBe(1);
    expect(result.current.rating).toEqual({average: 4.8, count: 320});
    expect(dishDetailApi.getCustomerDishDetail).toHaveBeenCalledWith(
      DISH_ID,
      expect.anything(),
    );
  });

  it('prefers the plan photo, resolved against the API base URL', async () => {
    get(customerSubscriptionApi.listPlans).mockResolvedValue([
      {...plan, imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image`},
    ]);
    const {result} = await renderHook(() => usePlanCover(PLAN_ID));

    expect(result.current.imageUrl).toBe(
      `https://api.craves.in/api/v1/subscriptions/plans/${PLAN_ID}/image`,
    );
    expect(result.current.kitchenName).toBe("Lakshmi's Kitchen");
  });

  it('hides the rating when the kitchen has no reviews', async () => {
    get(publicKitchenReviewApi.getSummary).mockResolvedValue({
      reviewCount: 0,
      overallAverage: null,
    });
    const {result} = await renderHook(() => usePlanCover(PLAN_ID));

    expect(result.current.rating).toBeNull();
  });

  it('yields nulls instead of throwing when the dish detail and rating calls fail', async () => {
    get(dishDetailApi.getCustomerDishDetail).mockRejectedValue(new Error('404'));
    const {result} = await renderHook(() => usePlanCover(PLAN_ID));

    expect(result.current).toMatchObject({
      imageUrl: null,
      kitchenName: null,
      rating: null,
    });
    expect(result.current.summary?.mealCount).toBe(1);
    expect(dishDetailApi.getCustomerDishDetail).toHaveBeenCalledTimes(1);
  });

  it('has no summary when the schedule is empty or fails to load', async () => {
    get(customerSubscriptionApi.getPlanSchedule).mockResolvedValue({
      planId: PLAN_ID,
      items: [],
    });
    const empty = await renderHook(() => usePlanCover(PLAN_ID));
    expect(empty.result.current.summary).toBeNull();
    expect(dishDetailApi.getCustomerDishDetail).not.toHaveBeenCalled();

    get(customerSubscriptionApi.getPlanSchedule).mockRejectedValue(new Error('500'));
    const failed = await renderHook(() => usePlanCover(PLAN_ID));
    expect(failed.result.current).toMatchObject({summary: null, imageUrl: null});
  });

  it('stays idle without a plan id', async () => {
    const {result} = await renderHook(() => usePlanCover(null));

    expect(result.current.summary).toBeNull();
    expect(customerSubscriptionApi.getPlanSchedule).not.toHaveBeenCalled();
  });
});

describe('useSubscriptionActions', () => {
  const SUBSCRIPTION_ID = '44444444-4444-4444-8444-444444444444';

  it('invalidates meal plan caches after an action, including a failed one', async () => {
    get(customerSubscriptionApi.pause).mockResolvedValueOnce({});
    const {result, queryClient} = await renderHook(() =>
      useSubscriptionActions(SUBSCRIPTION_ID),
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.pause();
    });
    expect(customerSubscriptionApi.pause).toHaveBeenCalledWith(SUBSCRIPTION_ID);
    expect(invalidate).toHaveBeenCalledWith({queryKey: mealPlanQueryPrefix});

    invalidate.mockClear();
    get(customerSubscriptionApi.pause).mockRejectedValueOnce(new Error('409'));
    await act(async () => {
      await expect(result.current.pause()).rejects.toThrow('409');
    });
    expect(invalidate).toHaveBeenCalledWith({queryKey: mealPlanQueryPrefix});
    expect(result.current.pending).toBe(false);
  });
});
