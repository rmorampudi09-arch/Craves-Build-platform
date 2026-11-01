import type {Offer} from '../api/contract';

export interface ReceivedOffer {
  offer: Offer;
  /** Phone time when the offer arrived. */
  receivedAtMs: number;
  /**
   * Phone time when it ends, from the native service (app 1.3.0): the server's expiresAt moved onto the phone's clock, never
   * later than arrival plus expiresInSec. Absent (mock builds, no server clock yet): arrival plus expiresInSec.
   */
  deadlineMs?: number;
}

export function offerDeadlineMs({offer, receivedAtMs, deadlineMs}: ReceivedOffer): number {
  return deadlineMs ?? receivedAtMs + offer.expiresInSec * 1000;
}

export function secondsLeft(received: ReceivedOffer, nowMs: number): number {
  return Math.max(0, Math.ceil((offerDeadlineMs(received) - nowMs) / 1000));
}

/** Show the newest offer that hasn't expired; a repeat of the same offer keeps its first arrival time. */
export function pickOffer(
  current: ReceivedOffer | null,
  incoming: ReceivedOffer,
  nowMs: number,
): ReceivedOffer | null {
  if (current && current.offer.offerId === incoming.offer.offerId) {
    return current;
  }
  if (secondsLeft(incoming, nowMs) > 0) {
    return incoming;
  }
  return current && secondsLeft(current, nowMs) > 0 ? current : null;
}
