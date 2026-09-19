import {
  createCustomerOrderReorder,
  reorderCartFingerprint,
  type CustomerReorderDependencies,
} from './domain/customerOrderReorder';
import type {CartSnapshot} from '../cart/domain/cartTypes';

const target = {
  orderId: '11111111-1111-4111-8111-111111111111',
  kitchenId: '22222222-2222-4222-8222-222222222222',
  eligible: true,
};

function cart(quantity = 1, updatedAt = '2026-09-19T10:00:00Z'): CartSnapshot {
  return {
    cartId: '33333333-3333-4333-8333-333333333333',
    currency: 'INR',
    lines: [{
      lineId: '44444444-4444-4444-8444-444444444444',
      menuItemId: '55555555-5555-4555-8555-555555555555',
      kitchenId: '66666666-6666-4666-8666-666666666666',
      itemName: 'Meal',
      kitchenName: 'Home Kitchen',
      unitPrice: {amount: '100', currency: 'INR'},
      quantity,
      lineTotal: {amount: String(100 * quantity), currency: 'INR'},
      createdAt: '2026-09-19T09:00:00Z',
      updatedAt,
    }],
    totals: {
      foodSubtotal: {amount: String(100 * quantity), currency: 'INR'},
    },
  };
}

function setup() {
  const dependencies: jest.Mocked<CustomerReorderDependencies> = {
    isCurrent: jest.fn(() => true),
    readCart: jest.fn().mockResolvedValue(cart()),
    confirm: jest.fn().mockResolvedValue(true),
    replaceCart: jest.fn().mockResolvedValue('APPLIED'),
  };
  return {
    dependencies,
    coordinator: createCustomerOrderReorder(dependencies),
  };
}

describe('safe customer reorder', () => {
  it('reads fresh state before consent and again before the conditional write', async () => {
    const {dependencies, coordinator} = setup();

    await expect(coordinator.run(target)).resolves.toBe('APPLIED');

    expect(dependencies.readCart).toHaveBeenCalledTimes(2);
    expect(dependencies.readCart.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.confirm.mock.invocationCallOrder[0],
    );
    expect(dependencies.confirm.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.readCart.mock.invocationCallOrder[1],
    );
    expect(dependencies.readCart.mock.invocationCallOrder[1]).toBeLessThan(
      dependencies.replaceCart.mock.invocationCallOrder[0],
    );
    expect(dependencies.replaceCart).toHaveBeenCalledWith(
      target.orderId,
      cart(),
      target.kitchenId,
    );
  });

  it('guards duplicate reorder taps', async () => {
    const {dependencies, coordinator} = setup();
    let release!: (value: boolean) => void;
    dependencies.confirm.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      }),
    );

    const first = coordinator.run(target);
    await expect(coordinator.run(target)).resolves.toBe('BUSY');
    release(true);
    await expect(first).resolves.toBe('APPLIED');
    expect(dependencies.replaceCart).toHaveBeenCalledTimes(1);
  });

  it('never writes without explicit consent', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.confirm.mockResolvedValue(false);

    await expect(coordinator.run(target)).resolves.toBe('CANCELLED');
    expect(dependencies.replaceCart).not.toHaveBeenCalled();
  });

  it('stops if the cart changes while the confirmation dialog is open', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.readCart
      .mockResolvedValueOnce(cart())
      .mockResolvedValueOnce(cart(2, '2026-09-19T10:01:00Z'));

    await expect(coordinator.run(target)).resolves.toBe('CART_CHANGED');
    expect(dependencies.replaceCart).not.toHaveBeenCalled();
  });

  it('stops before writing when a fresh cart read fails', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.readCart.mockResolvedValue(null);

    await expect(coordinator.run(target)).resolves.toBe('READ_FAILED');
    expect(dependencies.confirm).not.toHaveBeenCalled();
    expect(dependencies.replaceCart).not.toHaveBeenCalled();
  });

  it('stops if the active identity/session changes', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.confirm.mockImplementation(async () => {
      dependencies.isCurrent.mockReturnValue(false);
      return true;
    });

    await expect(coordinator.run(target)).resolves.toBe('STALE');
    expect(dependencies.replaceCart).not.toHaveBeenCalled();
  });

  it('does not write an ineligible order', async () => {
    const {dependencies, coordinator} = setup();

    await expect(
      coordinator.run({...target, eligible: false}),
    ).resolves.toBe('STALE');
    expect(dependencies.readCart).not.toHaveBeenCalled();
  });

  it('keeps ambiguous writes blocked until a cart review occurs', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.replaceCart.mockResolvedValueOnce('FAILED');

    await expect(coordinator.run(target)).resolves.toBe('UNCERTAIN');
    await expect(coordinator.run(target)).resolves.toBe('BUSY');
    expect(dependencies.replaceCart).toHaveBeenCalledTimes(1);

    coordinator.allowRetryAfterCartReview();
    await expect(coordinator.run(target)).resolves.toBe('APPLIED');
  });

  it('allows a new attempt after a definitive server rejection', async () => {
    const {dependencies, coordinator} = setup();
    dependencies.replaceCart.mockResolvedValueOnce('REJECTED');

    await expect(coordinator.run(target)).resolves.toBe('REJECTED');
    await expect(coordinator.run(target)).resolves.toBe('APPLIED');
  });

  it('treats server revision and displayed price changes as new consent state', () => {
    const before = cart();
    const revised = cart(1, '2026-09-19T10:01:00Z');
    const repriced: CartSnapshot = {
      ...before,
      lines: before.lines.map(line => ({
        ...line,
        unitPrice: {amount: '120', currency: 'INR'},
        lineTotal: {amount: '120', currency: 'INR'},
      })),
      totals: {foodSubtotal: {amount: '120', currency: 'INR'}},
    };

    expect(reorderCartFingerprint(before)).not.toBe(
      reorderCartFingerprint(revised),
    );
    expect(reorderCartFingerprint(before)).not.toBe(
      reorderCartFingerprint(repriced),
    );
  });
});
