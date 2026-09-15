import {deriveChefCompletedOrderUpdateAge} from './chefCompletedOrders';

describe('deriveChefCompletedOrderUpdateAge', () => {
  const nowMs = Date.parse('2026-08-09T12:00:00.000Z');

  it('labels the exposed timestamp as server update age rather than delivery time', () => {
    expect(
      deriveChefCompletedOrderUpdateAge('2026-08-09T11:42:00.000Z', nowMs),
    ).toEqual({elapsedMs: 1_080_000, label: 'Server updated 18 min ago'});
  });

  it('formats longer server update ages without inventing a deliveredAt value', () => {
    expect(
      deriveChefCompletedOrderUpdateAge('2026-08-09T09:00:00.000Z', nowMs)?.label,
    ).toBe('Server updated 3 hrs ago');
    expect(
      deriveChefCompletedOrderUpdateAge('2026-08-07T12:00:00.000Z', nowMs)?.label,
    ).toBe('Server updated 2 days ago');
  });

  it('fails closed for missing, malformed, or future-skewed timestamps', () => {
    expect(deriveChefCompletedOrderUpdateAge(null, nowMs)).toBeNull();
    expect(deriveChefCompletedOrderUpdateAge('not-a-date', nowMs)).toBeNull();
    expect(
      deriveChefCompletedOrderUpdateAge('2026-08-09T12:01:00.000Z', nowMs),
    ).toEqual({elapsedMs: 0, label: 'Server updated just now'});
  });
});
