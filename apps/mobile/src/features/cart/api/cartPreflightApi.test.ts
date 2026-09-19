import {httpClient} from '../../../core/http/httpClient';
import {
  cartPreflightApi,
  cartPreflightMatchesSnapshot,
  parseCartItemPreflight,
  parseCartPreflight,
} from './cartPreflightApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const item = {
  cartItemId: '11111111-1111-4111-8111-111111111111',
  menuItemId: '22222222-2222-4222-8222-222222222222',
  quantity: 2,
  activeAndAvailable: true,
  blockingIssue: false,
  cartUnitPrice: 180,
  currentUnitPrice: 200,
  cartKitchenId: '33333333-3333-4333-8333-333333333333',
  currentKitchenId: '33333333-3333-4333-8333-333333333333',
  cartItemName: 'Paneer Bowl',
  currentItemName: 'Paneer Bowl',
  issues: ['PRICE_CHANGED'],
};

const preflight = {
  cartId: '44444444-4444-4444-8444-444444444444',
  readyForCurrentCheckoutValidation: true,
  hasReviewChanges: true,
  itemCount: 1,
  blockingIssueCount: 0,
  reviewChangeCount: 1,
  checkedAt: '2026-09-19T12:00:00Z',
  items: [item],
};

describe('cartPreflightApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses exact review-change JSON without mutating values', () => {
    expect(parseCartPreflight(preflight)).toEqual({
      ...preflight,
      items: [
        {
          ...item,
          cartUnitPrice: '180',
          currentUnitPrice: '200',
        },
      ],
    });
  });

  it('accepts unavailable items only as blocking current-truth rows', () => {
    expect(
      parseCartItemPreflight({
        ...item,
        activeAndAvailable: false,
        blockingIssue: true,
        currentUnitPrice: null,
        currentKitchenId: null,
        currentItemName: null,
        issues: ['MENU_ITEM_UNAVAILABLE'],
      }),
    ).not.toBeNull();

    expect(
      parseCartItemPreflight({
        ...item,
        activeAndAvailable: false,
        blockingIssue: false,
        currentUnitPrice: null,
        currentKitchenId: null,
        currentItemName: null,
        issues: ['MENU_ITEM_UNAVAILABLE'],
      }),
    ).toBeNull();
  });

  it('locks aggregate counts to the returned item issues', () => {
    expect(
      parseCartPreflight({
        ...preflight,
        reviewChangeCount: 0,
      }),
    ).toBeNull();

    expect(
      parseCartPreflight({
        ...preflight,
        itemCount: 2,
      }),
    ).toBeNull();
  });

  it('rejects unexpected response fields', () => {
    expect(
      parseCartPreflight({
        ...preflight,
        customerIdentityId: 'private',
      }),
    ).toBeNull();

    expect(
      parseCartItemPreflight({
        ...item,
        internalCatalogPayload: {},
      }),
    ).toBeNull();
  });

  it('requires preflight to match the exact cart snapshot being reviewed', () => {
    const parsed = parseCartPreflight(preflight);
    expect(parsed).not.toBeNull();

    const snapshot = {
      cartId: preflight.cartId,
      currency: 'INR',
      lines: [
        {
          lineId: item.cartItemId,
          menuItemId: item.menuItemId,
          kitchenId: item.cartKitchenId,
          itemName: item.cartItemName,
          kitchenName: 'Test Kitchen',
          unitPrice: {amount: '180', currency: 'INR'},
          quantity: item.quantity,
          lineTotal: {amount: '360', currency: 'INR'},
          imageUrl: null,
          foodType: null,
          servesCount: null,
          spiceLevel: null,
          createdAt: '2026-09-19T11:00:00Z',
          updatedAt: '2026-09-19T11:00:00Z',
        },
      ],
      totals: {
        foodSubtotal: {amount: '360', currency: 'INR'},
      },
    };

    expect(cartPreflightMatchesSnapshot(parsed!, snapshot)).toBe(true);
    expect(
      cartPreflightMatchesSnapshot(parsed!, {
        ...snapshot,
        lines: [{...snapshot.lines[0], quantity: 3}],
      }),
    ).toBe(false);
  });

  it('reads the exact preflight route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(preflight);

    await expect(cartPreflightApi.inspect()).resolves.toEqual({
      ...preflight,
      items: [
        {
          ...item,
          cartUnitPrice: '180',
          currentUnitPrice: '200',
        },
      ],
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/cart/preflight', {
      signal: undefined,
      dedupeKey: 'customer-cart:preflight',
    });
  });

  it('rejects malformed backend responses', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      ...preflight,
      readyForCurrentCheckoutValidation: false,
    });

    await expect(cartPreflightApi.inspect()).rejects.toThrow(
      'CART_PREFLIGHT_INVALID_RESPONSE',
    );
  });
});
