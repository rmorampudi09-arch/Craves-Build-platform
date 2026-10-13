import {QueryClient} from '@tanstack/react-query';
import type {CustomerDishDetail} from '../../dishDetail/api/dishDetailApi';
import {
  createMealPlanQueryKey,
  invalidateMealPlanQueries,
  mealPlanQueryPrefix,
  resolveApiImageUrl,
  selectPlanCover,
} from './mealPlanQueries';

jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'}),
}));

const PLAN_ID = '11111111-1111-4111-8111-111111111111';

function image(id: string, url: string, sortOrder: number, primary = false) {
  return {id, url, sortOrder, primary};
}

function detail(
  images: CustomerDishDetail['images'],
  kitchen: Partial<CustomerDishDetail['kitchen']> = {},
): CustomerDishDetail {
  return {
    id: 'dish-1',
    kitchen: {
      id: 'kitchen-1',
      kitchenName: 'Lakshmi Foods Pvt Ltd',
      displayName: null,
      description: null,
      areaName: null,
      city: null,
      state: null,
      ...kitchen,
    },
    images,
  } as unknown as CustomerDishDetail;
}

describe('meal plan query keys', () => {
  it('gives each customer identity its own plan-list key', () => {
    expect(createMealPlanQueryKey('customer-1', 'plans')).not.toEqual(
      createMealPlanQueryKey('customer-2', 'plans'),
    );
  });

  it('separates resources and entities and stays under the invalidation prefix', () => {
    const plans = createMealPlanQueryKey('customer-1', 'plans');
    const schedule = createMealPlanQueryKey('customer-1', 'schedule', PLAN_ID);
    const policy = createMealPlanQueryKey('customer-1', 'policy', PLAN_ID);

    expect(schedule).not.toEqual(plans);
    expect(schedule).not.toEqual(policy);
    expect(schedule).not.toEqual(
      createMealPlanQueryKey('customer-1', 'schedule', 'other-plan'),
    );
    [plans, schedule, policy].forEach(key =>
      expect(key.slice(0, mealPlanQueryPrefix.length)).toEqual(
        mealPlanQueryPrefix,
      ),
    );
  });

  it('invalidates meal plan caches and nothing else', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {queries: {gcTime: Infinity}},
    });
    const planKey = createMealPlanQueryKey('customer-1', 'plans');
    const otherKey = ['craves', 'v1', 'private', 'customer-addresses'];
    queryClient.setQueryData(planKey, []);
    queryClient.setQueryData(otherKey, []);

    await invalidateMealPlanQueries(queryClient);

    expect(queryClient.getQueryState(planKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
});

describe('selectPlanCover', () => {
  it('prefers the primary image over a lower sort order', () => {
    const cover = selectPlanCover(
      detail([
        image('a', 'https://img/a.jpg', 0),
        image('b', 'https://img/b.jpg', 5, true),
      ]),
    );
    expect(cover.imageUrl).toBe('https://img/b.jpg');
  });

  it('falls back to the lowest sort order when none is primary', () => {
    const cover = selectPlanCover(
      detail([
        image('a', 'https://img/a.jpg', 3),
        image('b', 'https://img/b.jpg', 1),
      ]),
    );
    expect(cover.imageUrl).toBe('https://img/b.jpg');
  });

  it('returns nulls when there is no detail or no images', () => {
    const empty = {imageUrl: null, kitchenName: null, kitchenId: null};
    expect(selectPlanCover(undefined)).toEqual(empty);
    expect(selectPlanCover(detail([]))).toMatchObject({imageUrl: null});
  });

  it('prefers the kitchen display name and exposes the kitchen id', () => {
    expect(
      selectPlanCover(detail([], {displayName: "Lakshmi's Kitchen"})),
    ).toMatchObject({kitchenName: "Lakshmi's Kitchen", kitchenId: 'kitchen-1'});
    expect(selectPlanCover(detail([]))).toMatchObject({
      kitchenName: 'Lakshmi Foods Pvt Ltd',
    });
    expect(selectPlanCover(detail([], {displayName: '  '}))).toMatchObject({
      kitchenName: 'Lakshmi Foods Pvt Ltd',
    });
  });
});

describe('resolveApiImageUrl', () => {
  it('passes absolute https URLs through', () => {
    expect(resolveApiImageUrl('https://cdn.craves.in/a.jpg')).toBe(
      'https://cdn.craves.in/a.jpg',
    );
  });

  it('prefixes /api/ paths with the configured API base URL', () => {
    expect(resolveApiImageUrl(`/api/v1/subscriptions/plans/${PLAN_ID}/image`)).toBe(
      `https://api.craves.in/api/v1/subscriptions/plans/${PLAN_ID}/image`,
    );
  });

  it('rejects everything else', () => {
    [
      null,
      undefined,
      '',
      'http://insecure.example/a.jpg',
      '/other/a.jpg',
      '//evil.example/api/a.jpg',
      'a.jpg',
    ].forEach(value => expect(resolveApiImageUrl(value)).toBeNull());
  });
});
