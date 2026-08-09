import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {
  ChefOrderDecisionConflictError,
  createChefOrderDecisionCoordinator,
  createChefOrderDecisionIdempotencyKey,
  maskChefOrderContactPhone,
  type ChefOrderDecisionApi,
} from './chefOrderDecision';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function detail(
  overrides: Partial<ChefOrderDetail> = {},
): ChefOrderDetail {
  return {
    id: ORDER_ID,
    checkoutId: '22222222-2222-4222-8222-222222222222',
    kitchenId: '33333333-3333-4333-8333-333333333333',
    kitchenName: 'Meena’s Kitchen',
    status: 'CHEF_ACCEPTANCE_PENDING',
    currency: 'INR',
    foodSubtotal: 320,
    platformFee: 10,
    taxAmount: 16,
    deliveryFee: 25,
    grandTotal: 371,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-08-09T08:00:00Z',
    updatedAt: '2026-08-09T08:05:00Z',
    ...overrides,
  };
}

function api(overrides: Partial<ChefOrderDecisionApi> = {}): ChefOrderDecisionApi {
  return {
    getOrder: jest.fn(async () => detail()),
    acceptOrder: jest.fn(async () => detail({status: 'CHEF_ACCEPTED'})),
    rejectOrder: jest.fn(async () => detail({status: 'CHEF_REJECTED'})),
    ...overrides,
  };
}

describe('chefOrderDecision', () => {
  it('revalidates the server order before accepting and forwards a stable idempotency key', async () => {
    const calls: string[] = [];
    const server = api({
      getOrder: jest.fn(async () => {
        calls.push('get');
        return detail();
      }),
      acceptOrder: jest.fn(async (_id, request, key) => {
        calls.push(`accept:${request.prepTimeMinutes}:${key}`);
        return detail({status: 'CHEF_ACCEPTED'});
      }),
    });

    const result = await createChefOrderDecisionCoordinator(server).execute({
      kind: 'accept',
      orderId: ORDER_ID,
      prepTimeMinutes: 35,
    });

    expect(calls[0]).toBe('get');
    expect(calls[1]).toContain('accept:35:chef-order-accept-');
    expect(result.order.status).toBe('CHEF_ACCEPTED');
  });

  it('does not mutate when the revalidated order is no longer actionable', async () => {
    const server = api({
      getOrder: jest.fn(async () => detail({status: 'CHEF_ACCEPTED'})),
    });

    await expect(
      createChefOrderDecisionCoordinator(server).execute({
        kind: 'reject',
        orderId: ORDER_ID,
        reason: 'Kitchen capacity changed',
      }),
    ).rejects.toBeInstanceOf(ChefOrderDecisionConflictError);
    expect(server.rejectOrder).not.toHaveBeenCalled();
  });

  it('blocks an accept/reject race for the same order', async () => {
    let release: (value: ChefOrderDetail) => void = () => undefined;
    const pending = new Promise<ChefOrderDetail>(resolve => {
      release = resolve;
    });
    const server = api({getOrder: jest.fn(() => pending)});
    const coordinator = createChefOrderDecisionCoordinator(server);

    const first = coordinator.execute({
      kind: 'accept',
      orderId: ORDER_ID,
      prepTimeMinutes: 30,
    });
    await expect(
      coordinator.execute({
        kind: 'reject',
        orderId: ORDER_ID,
        reason: 'Unable to prepare',
      }),
    ).rejects.toMatchObject({code: 'CHEF_ORDER_DECISION_IN_PROGRESS'});

    release(detail());
    await first;
  });

  it('derives the same idempotency key for the same action and server revision', () => {
    const order = detail();
    expect(createChefOrderDecisionIdempotencyKey('accept', order)).toBe(
      createChefOrderDecisionIdempotencyKey('accept', order),
    );
    expect(createChefOrderDecisionIdempotencyKey('reject', order)).not.toBe(
      createChefOrderDecisionIdempotencyKey('accept', order),
    );
  });

  it('masks authorized contact data instead of exposing the raw phone number', () => {
    const masked = maskChefOrderContactPhone('+91 98765 43210');
    expect(masked).toContain('3210');
    expect(masked).not.toContain('98765');
  });
});
