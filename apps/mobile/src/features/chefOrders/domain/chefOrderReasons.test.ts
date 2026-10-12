import {
  NOT_PICKED_UP_REASONS,
  REJECT_REASONS,
  buildNotPickedUpCase,
  buildRejectReason,
} from './chefOrderReasons';

describe('reject reasons', () => {
  it('offers the five reasons from the board, in order', () => {
    expect(REJECT_REASONS.map(reason => reason.label)).toEqual([
      'An item is sold out',
      'Kitchen is too busy right now',
      'Closing soon',
      "Can't deliver to this area",
      'Other reason',
    ]);
  });

  it('sends the picked reason as the free-text reason, with the note after it', () => {
    expect(buildRejectReason('sold-out', '')).toBe('An item is sold out');
    expect(buildRejectReason('sold-out', '  no paneer left ')).toBe('An item is sold out: no paneer left');
  });

  it('needs a pick, and for "Other reason" a note', () => {
    expect(buildRejectReason(null, 'anything')).toBeNull();
    expect(buildRejectReason('other', '   ')).toBeNull();
    expect(buildRejectReason('other', ' Gas cylinder ran out ')).toBe('Gas cylinder ran out');
  });

  it('keeps the reason within the 500 characters the server takes', () => {
    expect(buildRejectReason('other', 'x'.repeat(900))).toHaveLength(500);
    expect(buildRejectReason('busy', 'x'.repeat(900))).toHaveLength(500);
  });
});

describe('not picked up', () => {
  it('offers the four reasons from the board', () => {
    expect(NOT_PICKED_UP_REASONS.map(reason => reason.label)).toEqual([
      "Partner hasn't arrived yet",
      'Partner left without the order',
      'Partner asked me to cancel',
      'Something else',
    ]);
  });

  it('writes the support case for the order with the reason and the note', () => {
    const orderId = '11111111-1111-4111-8111-1111-7a3df94b';
    expect(buildNotPickedUpCase(orderId, 'left', '')).toEqual({
      orderId,
      subject: 'Not picked up · #DF94B',
      message: 'Partner left without the order',
    });
    expect(buildNotPickedUpCase(orderId, 'late', ' Waiting 20 min ').message).toBe(
      "Partner hasn't arrived yet\n\nWaiting 20 min",
    );
  });
});
