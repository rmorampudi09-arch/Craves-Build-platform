import type {ChefBankState, ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import type {ChefFinanceBalance} from '../api/chefPayoutApi';
import {
  bankSummaryLine,
  earningStatusView,
  groupByMonth,
  payoutStatusView,
  pendingSettlement,
  withdrawBlockedReason,
} from './chefPayoutPresentation';

const balance = (overrides: Partial<ChefFinanceBalance> = {}): ChefFinanceBalance =>
  ({
    available: '3450.00',
    outstanding: '3450.00',
    reservedOrPaid: '0.00',
    onHold: false,
    manualRequestUsedToday: false,
    executionEnabled: true,
    ...overrides,
  }) as ChefFinanceBalance;

const bank = (state: ChefBankState): ChefBankStatus => ({state}) as ChefBankStatus;

describe('payoutStatusView', () => {
  it.each([
    ['RESERVED', 'Asked'],
    ['SUBMITTING', 'Sending'],
    ['PROCESSING', 'With the bank'],
    ['PAID', 'Paid'],
    ['FAILED', "Didn't go through"],
    ['REVERSED', 'Returned by bank'],
    ['REVIEW_REQUIRED', 'Craves is checking'],
    ['UNKNOWN', 'Craves is checking'],
    ['CANCELLED', 'Cancelled'],
  ])('shows %s as "%s"', (status, label) => {
    expect(payoutStatusView(status).label).toBe(label);
  });

  it('shows a waiting-for-approval payout, or any status it does not know, as Craves checking', () => {
    expect(payoutStatusView('PENDING_APPROVAL').label).toBe('Craves is checking');
    expect(payoutStatusView('SOMETHING_NEW').label).toBe('Craves is checking');
  });

  it('never leaks the raw code into the explanation', () => {
    for (const status of ['RESERVED', 'REVIEW_REQUIRED', 'PENDING_APPROVAL', 'FAILED', 'REVERSED']) {
      expect(payoutStatusView(status).note).not.toMatch(/[A-Z]{3,}_[A-Z]+/);
    }
  });
});

describe('earningStatusView', () => {
  it('uses plain words for every ledger status', () => {
    expect(earningStatusView('APPROVED').label).toBe('Earned');
    expect(earningStatusView('SETTLED').label).toBe('Settled');
    expect(earningStatusView('REVERSED').label).toBe('Reversed');
    expect(earningStatusView('DRAFT').label).toBe('Being checked');
    expect(earningStatusView('SETTLEMENT_PENDING').label).toBe('Settling');
  });
});

describe('withdrawBlockedReason', () => {
  it('lets a verified chef with money withdraw', () => {
    expect(withdrawBlockedReason(balance(), bank('VERIFIED'))).toBeNull();
  });

  it('does not block on the bank before the bank status has loaded', () => {
    expect(withdrawBlockedReason(balance(), null)).toBeNull();
  });

  it('says why in one plain line', () => {
    expect(withdrawBlockedReason(balance({manualRequestUsedToday: true}), bank('VERIFIED'))?.text).toBe(
      'You already withdrew today. You can withdraw again tomorrow.',
    );
    expect(withdrawBlockedReason(balance({onHold: true}), bank('VERIFIED'))?.text).toBe(
      'Your balance is on hold right now. Please contact Craves support.',
    );
    expect(withdrawBlockedReason(balance({available: '0.00'}), bank('VERIFIED'))?.text).toBe(
      'Nothing to withdraw yet. Earnings from delivered orders appear here.',
    );
    expect(withdrawBlockedReason(balance({executionEnabled: false}), bank('VERIFIED'))?.text).toBe(
      'Withdrawals are paused right now. Please try again later.',
    );
  });

  it('asks for a bank account first, since that is the one thing the chef can do about it', () => {
    const reason = withdrawBlockedReason(balance({available: '0.00'}), bank('NOT_SUBMITTED'));
    expect(reason).toEqual({kind: 'bank', text: 'No bank account yet. Add one to get paid.', action: 'Add bank account'});
  });

  it('points to the bank screen while the account is still being checked or was refused', () => {
    expect(withdrawBlockedReason(balance(), bank('VALIDATING'))).toMatchObject({
      kind: 'bank',
      text: "We're still checking your bank account.",
      action: 'Bank account',
    });
    expect(withdrawBlockedReason(balance(), bank('NAME_MISMATCH'))).toMatchObject({
      kind: 'bank',
      text: "Your bank account couldn't be verified. Check the details.",
    });
  });
});

describe('bankSummaryLine', () => {
  it('says where the money goes in plain words for every state of the account', () => {
    expect(bankSummaryLine(null)).toBe('Where your money goes');
    expect(bankSummaryLine({state: 'VERIFIED', lastFour: '4521', bankName: 'State Bank of India'} as ChefBankStatus)).toBe(
      'State Bank of India ••4521 · verified',
    );
    expect(bankSummaryLine({state: 'VERIFIED', lastFour: '4521'} as ChefBankStatus)).toBe('••4521 · verified');
    expect(bankSummaryLine(bank('NOT_SUBMITTED'))).toBe('Add where your money goes');
    expect(bankSummaryLine(bank('WAITING_APPROVAL'))).toBe('Checking your account…');
    expect(bankSummaryLine(bank('VALIDATION_FAILED'))).toBe("Couldn't verify. Check the details.");
  });
});

describe('pendingSettlement', () => {
  it('is the part of the earnings not yet open to withdraw, and zero when there is none', () => {
    expect(pendingSettlement(balance({available: '3450.00', outstanding: '3870.00'}))).toBe(420);
    expect(pendingSettlement(balance())).toBe(0);
    expect(pendingSettlement(balance({available: '100.00', outstanding: '40.00'}))).toBe(0);
  });
});

describe('groupByMonth', () => {
  const now = new Date(2026, 9, 13);
  const iso = (month: number, day: number) => new Date(2026, month, day, 10).toISOString();

  it('groups newest-first items under their month, naming the year only when it is not this year', () => {
    const rows = [
      {id: 1, at: iso(9, 12)},
      {id: 2, at: iso(9, 2)},
      {id: 3, at: iso(8, 29)},
      {id: 4, at: new Date(2025, 11, 30).toISOString()},
    ];
    expect(groupByMonth(rows, row => row.at, now)).toEqual([
      {title: 'October', items: [rows[0], rows[1]]},
      {title: 'September', items: [rows[2]]},
      {title: 'December 2025', items: [rows[3]]},
    ]);
  });
});
