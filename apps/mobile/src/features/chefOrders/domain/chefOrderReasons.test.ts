import {
  NOT_PICKED_UP_REASONS,
  REJECT_REASONS,
  buildNotPickedUpCase,
  buildRejectReason,
  rejectConsequence,
  rejectKindOf,
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

describe('what rejecting means for the customer', () => {
  it('tells a paid order from a meal-plan day by its checkout', () => {
    expect(rejectKindOf({checkoutId: '22222222-2222-4222-8222-222222222222'})).toBe('paid');
    expect(rejectKindOf({checkoutId: null})).toBe('meal-plan');
    expect(rejectKindOf({})).toBe('meal-plan');
  });

  it('says only what is true for each kind', () => {
    expect(rejectConsequence('paid')).toBe('The customer is told right away and gets a full refund.');
    expect(rejectConsequence('meal-plan')).toBe(
      'The customer is told right away. This meal-plan day moves to the end of their plan.',
    );
    // A scheduled order the customer has not paid for yet has nothing to refund.
    expect(rejectConsequence('unpaid')).toBe('The customer is told right away.');
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
