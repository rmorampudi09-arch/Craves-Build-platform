import {httpClient} from '../../../core/http/httpClient';
import {
  chefSubscriptionApi,
  menuItemRuleSchema,
} from './chefSubscriptionApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
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