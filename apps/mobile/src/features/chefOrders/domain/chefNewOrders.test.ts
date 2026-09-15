import {deriveChefNewOrderReceivedAge} from './chefNewOrders';

describe('deriveChefNewOrderReceivedAge', () => {
  const NOW = Date.parse('2026-08-09T12:00:00Z');

  it('derives minutes from the server received timestamp', () => {
    expect(
      deriveChefNewOrderReceivedAge('2026-08-09T11:42:00Z', NOW),
    ).toEqual({elapsedMinutes: 18, label: 'Received 18 min ago'});
  });

  it('formats longer ages without inventing an acceptance deadline', () => {
    expect(
      deriveChefNewOrderReceivedAge('2026-08-09T09:35:00Z', NOW),
    ).toEqual({elapsedMinutes: 145, label: 'Received 2 hrs 25 min ago'});
  });

  it('fails soft when the server timestamp is unavailable or malformed', () => {
    expect(deriveChefNewOrderReceivedAge(null, NOW)).toEqual({
      elapsedMinutes: null,
      label: 'Received time unavailable',
    });
    expect(deriveChefNewOrderReceivedAge('not-a-date', NOW)).toEqual({
      elapsedMinutes: null,
      label: 'Received time unavailable',
    });
  });

  it('clamps future clock skew instead of showing a negative age', () => {
    expect(
      deriveChefNewOrderReceivedAge('2026-08-09T12:02:00Z', NOW),
    ).toEqual({elapsedMinutes: 0, label: 'Received just now'});
  });
});
