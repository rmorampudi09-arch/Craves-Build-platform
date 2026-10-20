import type {Offer} from '../api/contract';
import {pickOffer, secondsLeft} from './offerTiming';

const offer = (offerId: string, expiresInSec = 40): Offer => ({
  offerId,
  tripId: `t-${offerId}`,
  expiresAt: '2026-10-19T10:00:40Z',
  expiresInSec,
  payPaise: 6800,
  pickupDistanceM: 1200,
  dropDistanceM: 3400,
  kitchenArea: 'Madhapur',
  customerLocality: 'Kondapur',
  estMinutes: 28,
  payLines: [{label: 'base', amountPaise: 4000}],
});

describe('offer timing', () => {
  it('counts down from arrival time, not the server clock', () => {
    const received = {offer: offer('a'), receivedAtMs: 10_000};
    expect(secondsLeft(received, 10_000)).toBe(40);
    expect(secondsLeft(received, 49_100)).toBe(1);
    expect(secondsLeft(received, 50_000)).toBe(0);
    expect(secondsLeft(received, 90_000)).toBe(0);
  });

  it('shows the newest unexpired offer', () => {
    const first = {offer: offer('a'), receivedAtMs: 0};
    const second = {offer: offer('b'), receivedAtMs: 5_000};
    expect(pickOffer(first, second, 6_000)).toBe(second);
  });

  it('keeps the first arrival time for a repeated offer', () => {
    const first = {offer: offer('a'), receivedAtMs: 0};
    expect(pickOffer(first, {offer: offer('a'), receivedAtMs: 9_000}, 9_000)).toBe(first);
  });

  it('ignores an offer that arrives already expired', () => {
    const first = {offer: offer('a'), receivedAtMs: 0};
    const stale = {offer: offer('b', 1), receivedAtMs: 0};
    expect(pickOffer(first, stale, 5_000)).toBe(first);
    expect(pickOffer(null, stale, 5_000)).toBeNull();
  });
});
