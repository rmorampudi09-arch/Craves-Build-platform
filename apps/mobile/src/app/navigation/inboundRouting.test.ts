import {
  createInboundRouteDedupe,
  parseInboundUrl,
  resolveInboundRoute,
  type InboundRouteContext,
} from './inboundRouting';

const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const KITCHEN_ID = '33333333-3333-4333-8333-333333333333';

const customerContext: InboundRouteContext = {
  authenticated: true,
  authorizedRole: 'CUSTOMER',
  productReady: true,
};
const chefContext: InboundRouteContext = {
  authenticated: true,
  authorizedRole: 'CHEF',
  productReady: true,
};

describe('inboundRouting', () => {
  it('parses only canonical allowlisted Craves destinations', () => {
    expect(parseInboundUrl('craves://customer')).toEqual({kind: 'CUSTOMER'});
    expect(parseInboundUrl('craves://chef')).toEqual({kind: 'CHEF'});
    expect(parseInboundUrl(`craves://order/${ORDER_ID}`)).toEqual({
      kind: 'ORDER',
      orderId: ORDER_ID,
    });
    expect(parseInboundUrl('craves://offer')).toEqual({kind: 'OFFER'});
    expect(parseInboundUrl(`craves://kitchen/${KITCHEN_ID}`)).toEqual({
      kind: 'KITCHEN',
      kitchenId: KITCHEN_ID,
    });

    expect(parseInboundUrl('https://craves.in/order/anything')).toBeNull();
    expect(parseInboundUrl('craves://order/not-a-uuid')).toBeNull();
    expect(parseInboundUrl(`craves://order/${ORDER_ID}?admin=true`)).toBeNull();
    expect(parseInboundUrl(`craves://kitchen/${KITCHEN_ID}/menu`)).toBeNull();
    expect(parseInboundUrl('craves://Customer')).toBeNull();
    expect(parseInboundUrl(' craves://customer')).toBeNull();
    expect(parseInboundUrl('craves://unknown')).toBeNull();
  });

  it('defers protected destinations until authentication and product-root readiness', () => {
    const candidate = parseInboundUrl(`craves://order/${ORDER_ID}`)!;

    expect(
      resolveInboundRoute(candidate, {
        authenticated: false,
        authorizedRole: null,
        productReady: false,
      }),
    ).toEqual({status: 'DEFER', reason: 'AUTH_REQUIRED'});

    expect(
      resolveInboundRoute(candidate, {
        authenticated: true,
        authorizedRole: null,
        productReady: false,
      }),
    ).toEqual({status: 'DEFER', reason: 'PRODUCT_NOT_READY'});
  });

  it('routes an order only inside the authoritative signed-in role', () => {
    const candidate = parseInboundUrl(`craves://order/${ORDER_ID}`)!;

    expect(resolveInboundRoute(candidate, customerContext)).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CUSTOMER_ORDER_DETAIL', orderId: ORDER_ID},
    });
    expect(resolveInboundRoute(candidate, chefContext)).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CHEF_ORDER_DETAIL', orderId: ORDER_ID},
    });
  });

  it('keeps role-owned roots and kitchens isolated', () => {
    expect(resolveInboundRoute({kind: 'CUSTOMER'}, customerContext)).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CUSTOMER_HOME'},
    });
    expect(resolveInboundRoute({kind: 'CUSTOMER'}, chefContext)).toEqual({
      status: 'BLOCKED',
      reason: 'ROLE_MISMATCH',
    });
    expect(resolveInboundRoute({kind: 'CHEF'}, chefContext)).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CHEF_HOME'},
    });
    expect(resolveInboundRoute({kind: 'CHEF'}, customerContext)).toEqual({
      status: 'BLOCKED',
      reason: 'ROLE_MISMATCH',
    });
    expect(
      resolveInboundRoute({kind: 'KITCHEN', kitchenId: KITCHEN_ID}, customerContext),
    ).toEqual({
      status: 'NAVIGATE',
      destination: {kind: 'CUSTOMER_KITCHEN_PROFILE', kitchenId: KITCHEN_ID},
    });
    expect(
      resolveInboundRoute({kind: 'KITCHEN', kitchenId: KITCHEN_ID}, chefContext),
    ).toEqual({status: 'BLOCKED', reason: 'ROLE_MISMATCH'});
  });

  it('recognizes offer links but leaves the blocked P70/P71 destination fail closed', () => {
    expect(resolveInboundRoute({kind: 'OFFER'}, customerContext)).toEqual({
      status: 'BLOCKED',
      reason: 'DESTINATION_UNAVAILABLE',
    });
  });

  it('deduplicates repeated destination taps without suppressing later navigation', () => {
    const dedupe = createInboundRouteDedupe(2_000);
    const destination = {kind: 'CUSTOMER_ORDER_DETAIL', orderId: ORDER_ID} as const;

    expect(dedupe.claim(destination, 1_000)).toBe(true);
    expect(dedupe.claim(destination, 1_250)).toBe(false);
    expect(dedupe.claim(destination, 2_999)).toBe(false);
    expect(dedupe.claim(destination, 3_000)).toBe(true);

    dedupe.release(destination);
    expect(dedupe.claim(destination, 3_001)).toBe(true);
  });
});
