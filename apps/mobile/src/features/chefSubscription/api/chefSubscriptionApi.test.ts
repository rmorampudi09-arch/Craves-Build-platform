import {httpClient} from '../../../core/http/httpClient';
import {
  chefMealPlanSchema,
  chefSubscriptionApi,
  menuItemRuleSchema,
} from './chefSubscriptionApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    patch: jest.fn(),
    put: jest.fn(),
  },
}));

const CHEF_ID = '11111111-1111-4111-8111-111111111111';
const MENU_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '33333333-3333-4333-8333-333333333333';

const rule = {
  id: RULE_ID,
  chefIdentityId: CHEF_ID,
  menuItemId: MENU_ITEM_ID,
  isoDayOfWeek: 3,
  mealSlotCode: 'LUNCH',
  maxSubscriptionUnits: 8,
  salesEnabled: true,
  recurringReservedUnits: 3,
  recurringAvailableUnits: 5,
  recurringDeficitUnits: 0,
  version: 2,
  updatedAt: '2026-09-20T12:00:00Z',
};

describe('chefSubscriptionApi slot capacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the exact slot-capacity request and verifies the response', async () => {
    const slotRule = {
      id: '66666666-6666-4666-8666-666666666666',
      chefIdentityId: CHEF_ID,
      isoDayOfWeek: 3,
      mealSlotCode: 'LUNCH',
      totalCapacityUnits: 20,
      subscriptionCapacityUnits: 8,
      salesEnabled: true,
      recurringReservedUnits: 3,
      recurringAvailableUnits: 5,
      recurringDeficitUnits: 0,
      version: 2,
      updatedAt: '2026-09-20T12:00:00Z',
    };
    (httpClient.put as jest.Mock).mockResolvedValue(slotRule);

    await expect(
      chefSubscriptionApi.putSlotRule({
        isoDayOfWeek: 3,
        mealSlotCode: ' lunch ',
        totalCapacityUnits: 20,
        subscriptionCapacityUnits: 8,
        salesEnabled: true,
        reason: ' Updated from Chef mobile ',
      }),
    ).resolves.toEqual(slotRule);

    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/chef/subscription-capacity/rules/slots',
      {
        isoDayOfWeek: 3,
        mealSlotCode: 'LUNCH',
        totalCapacityUnits: 20,
        subscriptionCapacityUnits: 8,
        salesEnabled: true,
        reason: 'Updated from Chef mobile',
      },
    );
  });

  it('rejects slot subscription capacity above total capacity before transport', async () => {
    await expect(
      chefSubscriptionApi.putSlotRule({
        isoDayOfWeek: 3,
        mealSlotCode: 'LUNCH',
        totalCapacityUnits: 5,
        subscriptionCapacityUnits: 6,
        salesEnabled: true,
        reason: 'Invalid',
      }),
    ).rejects.toThrow();

    expect(httpClient.put).not.toHaveBeenCalled();
  });
});

describe('chefSubscriptionApi menu item capacity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the exact menu-item capacity request and normalizes the slot', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue(rule);

    await expect(
      chefSubscriptionApi.putMenuItemRule({
        menuItemId: MENU_ITEM_ID,
        isoDayOfWeek: 3,
        mealSlotCode: ' lunch ',
        maxSubscriptionUnits: 8,
        salesEnabled: true,
        reason: ' Updated from Chef mobile ',
      }),
    ).resolves.toEqual(rule);

    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/chef/subscription-capacity/rules/menu-items',
      {
        menuItemId: MENU_ITEM_ID,
        isoDayOfWeek: 3,
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: 8,
        salesEnabled: true,
        reason: 'Updated from Chef mobile',
      },
    );
  });

  it('rejects invalid bounds before transport', async () => {
    await expect(
      chefSubscriptionApi.putMenuItemRule({
        menuItemId: MENU_ITEM_ID,
        isoDayOfWeek: 8,
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: 8,
        salesEnabled: true,
        reason: 'Updated from Chef mobile',
      }),
    ).rejects.toThrow();

    await expect(
      chefSubscriptionApi.putMenuItemRule({
        menuItemId: MENU_ITEM_ID,
        isoDayOfWeek: 3,
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: -1,
        salesEnabled: true,
        reason: 'Updated from Chef mobile',
      }),
    ).rejects.toThrow();

    expect(httpClient.put).not.toHaveBeenCalled();
  });

  it('fails closed on unsupported response fields', () => {
    expect(
      menuItemRuleSchema.safeParse({
        ...rule,
        internalIncidentId: 'private',
      }).success,
    ).toBe(false);
  });
});


describe('chefSubscriptionApi date overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the exact slot date override and verifies the response', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      chefIdentityId: CHEF_ID,
      serviceDate: '2026-09-25',
      mealSlotCode: 'DINNER',
      totalCapacityUnits: 20,
      subscriptionCapacityUnits: 8,
      closed: false,
      reason: 'Festival staffing',
      heldUnits: 2,
      committedUnits: 4,
      deficitUnits: 0,
      updatedAt: '2026-09-20T13:00:00Z',
    });

    await expect(
      chefSubscriptionApi.putDateOverride({
        serviceDate: '2026-09-25',
        mealSlotCode: ' dinner ',
        totalCapacityUnits: 20,
        subscriptionCapacityUnits: 8,
        closed: false,
        reason: ' Festival staffing ',
      }),
    ).resolves.toMatchObject({
      serviceDate: '2026-09-25',
      mealSlotCode: 'DINNER',
      subscriptionCapacityUnits: 8,
    });

    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/chef/subscription-capacity/overrides/slots',
      {
        serviceDate: '2026-09-25',
        mealSlotCode: 'DINNER',
        totalCapacityUnits: 20,
        subscriptionCapacityUnits: 8,
        closed: false,
        reason: 'Festival staffing',
      },
    );
  });

  it('sends the exact dish date override and keeps normal menu state separate', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      chefIdentityId: CHEF_ID,
      menuItemId: MENU_ITEM_ID,
      serviceDate: '2026-09-25',
      mealSlotCode: 'LUNCH',
      maxSubscriptionUnits: 5,
      closed: true,
      reason: 'Not offered for subscriptions that day',
      heldUnits: 0,
      committedUnits: 3,
      deficitUnits: 3,
      updatedAt: '2026-09-20T13:05:00Z',
    });

    await chefSubscriptionApi.putMenuItemDateOverride({
      menuItemId: MENU_ITEM_ID,
      serviceDate: '2026-09-25',
      mealSlotCode: ' lunch ',
      maxSubscriptionUnits: 5,
      closed: true,
      reason: ' Not offered for subscriptions that day ',
    });

    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/v1/chef/subscription-capacity/overrides/menu-items',
      {
        menuItemId: MENU_ITEM_ID,
        serviceDate: '2026-09-25',
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: 5,
        closed: true,
        reason: 'Not offered for subscriptions that day',
      },
    );
  });

  it('rejects a slot override where subscription capacity exceeds total', async () => {
    await expect(
      chefSubscriptionApi.putDateOverride({
        serviceDate: '2026-09-25',
        mealSlotCode: 'LUNCH',
        totalCapacityUnits: 5,
        subscriptionCapacityUnits: 6,
        closed: false,
        reason: 'Invalid',
      }),
    ).rejects.toThrow();

    expect(httpClient.put).not.toHaveBeenCalled();
  });
});

describe('chefSubscriptionApi plan photo and accepting-subscribers', () => {
  const PLAN_ID = '77777777-7777-4777-8777-777777777777';
  const plan = {
    id: PLAN_ID,
    planCode: 'WEEKLY-LUNCH',
    name: 'Weekly Home Lunch Plan',
    description: null,
    billingPeriod: 'WEEKLY',
    amount: 1499,
    currency: 'INR',
    status: 'ACTIVE',
    reviewReason: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: '2026-09-20T12:00:00Z',
    updatedAt: '2026-09-20T12:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the new plan fields optional so an older backend still parses', () => {
    const parsed = chefMealPlanSchema.parse(plan);
    expect('imageUrl' in parsed).toBe(false);
    expect('acceptingSubscribers' in parsed).toBe(false);

    expect(chefMealPlanSchema.parse({...plan, imageUrl: null, acceptingSubscribers: null})).toMatchObject({
      imageUrl: null,
      acceptingSubscribers: null,
    });
    expect(
      chefMealPlanSchema.parse({
        ...plan,
        imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=3`,
        acceptingSubscribers: false,
      }),
    ).toMatchObject({
      imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=3`,
      acceptingSubscribers: false,
    });
  });

  it('patches accepting-subscribers and verifies the returned plan', async () => {
    (httpClient.patch as jest.Mock).mockResolvedValue({...plan, acceptingSubscribers: false});

    await expect(chefSubscriptionApi.setAcceptingSubscribers(PLAN_ID, false)).resolves.toMatchObject({
      id: PLAN_ID,
      acceptingSubscribers: false,
    });

    expect(httpClient.patch).toHaveBeenCalledWith(
      `/api/v1/chef/subscription-plans/${PLAN_ID}/accepting-subscribers`,
      {acceptingSubscribers: false},
    );
  });

  it('puts the plan photo as multipart and verifies the returned plan', async () => {
    const form = new FormData();
    (httpClient.put as jest.Mock).mockResolvedValue({
      ...plan,
      imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=4`,
    });

    await expect(chefSubscriptionApi.uploadPlanImage(PLAN_ID, form)).resolves.toMatchObject({
      imageUrl: `/api/v1/subscriptions/plans/${PLAN_ID}/image?v=4`,
    });

    expect(httpClient.put).toHaveBeenCalledWith(
      `/api/v1/chef/subscription-plans/${PLAN_ID}/image`,
      form,
    );
  });

  it('rejects an unverifiable response', async () => {
    (httpClient.patch as jest.Mock).mockResolvedValue({id: PLAN_ID});
    await expect(chefSubscriptionApi.setAcceptingSubscribers(PLAN_ID, true)).rejects.toThrow();
  });
});
