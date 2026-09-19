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
