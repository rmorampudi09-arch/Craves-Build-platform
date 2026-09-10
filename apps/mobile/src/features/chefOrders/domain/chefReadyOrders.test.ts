import {deriveChefReadyOrderAge} from './chefReadyOrders';

describe('deriveChefReadyOrderAge', () => {
  const nowMs = Date.parse('2026-08-09T12:00:00.000Z');

  it('reports a recent server update without inventing a ready timestamp', () => {
    expect(
      deriveChefReadyOrderAge('2026-08-09T11:59:40.000Z', nowMs),
    ).toEqual({elapsedMs: 20_000, label: 'Updated just now'});
  });

  it('formats elapsed minutes and hours from the exposed updatedAt timestamp', () => {
    expect(
      deriveChefReadyOrderAge('2026-08-09T11:42:00.000Z', nowMs)?.label,
    ).toBe('Updated 18 min ago');
    expect(
      deriveChefReadyOrderAge('2026-08-09T09:00:00.000Z', nowMs)?.label,
    ).toBe('Updated 3 hrs ago');
  });

  it('fails closed for missing or malformed timestamps', () => {
    expect(deriveChefReadyOrderAge(null, nowMs)).toBeNull();
    expect(deriveChefReadyOrderAge('not-a-date', nowMs)).toBeNull();
    expect(deriveChefReadyOrderAge('2026-08-09T12:01:00.000Z', nowMs)).toEqual({
      elapsedMs: 0,
      label: 'Updated just now',
    });
  });
});
