import type {ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import type {StatusChipTone} from '../../chefShell/components/ui/StatusChip';
import type {ChefEarningStatus, ChefFinanceBalance} from '../api/chefPayoutApi';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CHECKING = 'Craves is checking';
const CHECKING_NOTE = "We're looking at this payout. We'll update it here.";

// craves.in words. PENDING_APPROVAL (and anything new the server adds) reads as Craves checking, never as a raw code.
const PAYOUT_STATUS_VIEWS: Record<string, {label: string; tone: StatusChipTone; note: string}> = {
  RESERVED: {label: 'Requested', tone: 'cooking', note: 'We have your request and will send it to your bank.'},
  SUBMITTING: {label: 'Sending', tone: 'cooking', note: "We're sending the money to your bank."},
  PROCESSING: {label: 'With the bank', tone: 'cooking', note: 'Your bank is processing the transfer.'},
  PAID: {label: 'Paid', tone: 'ready', note: 'The money has reached your bank.'},
  FAILED: {
    label: "Didn't go through",
    tone: 'new',
    note: "The transfer didn't go through. Please check your bank account or contact Craves support.",
  },
  REVERSED: {label: 'Returned by bank', tone: 'new', note: 'Money is back in your balance.'},
  REVIEW_REQUIRED: {label: CHECKING, tone: 'cooking', note: CHECKING_NOTE},
  UNKNOWN: {label: CHECKING, tone: 'cooking', note: CHECKING_NOTE},
  CANCELLED: {label: 'Cancelled', tone: 'done', note: 'This request was cancelled.'},
};

export function payoutStatusView(status: string): {label: string; tone: StatusChipTone; note: string} {
  return PAYOUT_STATUS_VIEWS[status] ?? {label: CHECKING, tone: 'cooking', note: CHECKING_NOTE};
}

const EARNING_STATUS_VIEWS: Record<ChefEarningStatus, {label: string; tone: StatusChipTone}> = {
  DRAFT: {label: 'Being checked', tone: 'draft'},
  APPROVED: {label: 'Earned', tone: 'ready'},
  SETTLEMENT_PENDING: {label: 'Settling', tone: 'info'},
  SETTLED: {label: 'Settled', tone: 'done'},
  REVERSED: {label: 'Reversed', tone: 'new'},
};

export function earningStatusView(status: ChefEarningStatus): {label: string; tone: StatusChipTone} {
  return EARNING_STATUS_VIEWS[status];
}

export interface WithdrawBlock {
  kind: 'bank' | 'hold' | 'used' | 'paused' | 'empty';
  /** The one line shown under the Withdraw button. */
  text: string;
  /** Only for `bank`: what the button says, since it opens the bank screen instead. */
  action?: string;
}

const NEEDS_BANK_STATES = new Set(['NOT_SUBMITTED', 'SUPERSEDED']);

/** True once the bank status has loaded and there is no account to pay into. */
export function needsBankAccount(bank: ChefBankStatus | null): boolean {
  return bank !== null && NEEDS_BANK_STATES.has(bank.state);
}
const REFUSED_BANK_STATES = new Set(['VALIDATION_FAILED', 'NAME_MISMATCH', 'APPLICANT_ACTION_REQUIRED']);

/** The Bank account row's second line on the Earnings tab. */
export function bankSummaryLine(bank: ChefBankStatus | null): string {
  if (!bank) return 'Where your money goes';
  if (bank.state === 'VERIFIED') {
    return `${bank.bankName ? `${bank.bankName} ` : ''}••${bank.lastFour ?? ''} · verified`;
  }
  if (NEEDS_BANK_STATES.has(bank.state)) return 'Add where your money goes';
  return REFUSED_BANK_STATES.has(bank.state) ? "Couldn't verify. Check the details." : 'Checking your account…';
}

/**
 * Why Withdraw is greyed out, or null when it can be used. A bank that has not loaded yet never blocks:
 * the server still checks everything when the request is sent.
 */
export function withdrawBlockedReason(balance: ChefFinanceBalance, bank: ChefBankStatus | null): WithdrawBlock | null {
  if (bank && bank.state !== 'VERIFIED') {
    if (NEEDS_BANK_STATES.has(bank.state)) {
      return {kind: 'bank', text: 'No bank account yet. Add one to get paid.', action: 'Add bank account'};
    }
    return {
      kind: 'bank',
      text: REFUSED_BANK_STATES.has(bank.state)
        ? "Your bank account couldn't be verified. Check the details."
        : "We're still checking your bank account.",
      action: 'Bank account',
    };
  }
  if (balance.onHold) {
    return {kind: 'hold', text: 'Your balance is on hold right now. Please contact Craves support.'};
  }
  if (balance.manualRequestUsedToday) {
    return {kind: 'used', text: 'You already withdrew today. You can withdraw again tomorrow.'};
  }
  if (!balance.executionEnabled) {
    return {kind: 'paused', text: 'Withdrawals are paused right now. Please try again later.'};
  }
  if (!(Number(balance.available) > 0)) {
    return {kind: 'empty', text: 'Nothing to withdraw yet. Earnings from delivered orders appear here.'};
  }
  return null;
}

/**
 * Rupees the server holds back, shown only when the balance says it is on hold (available is 0 then).
 * Not outstanding minus available: outstanding is the earnings sum, and a payout in flight may not be taken off yet.
 */
export function onHoldAmount(balance: ChefFinanceBalance): number {
  const held = balance.onHold ? Math.round(Number(balance.outstanding) * 100) / 100 : 0;
  return held > 0 ? held : 0;
}

/** Newest-first rows under `October`-style headings (the year is added only for another year). */
export function groupByMonth<T>(
  rows: readonly T[],
  isoOf: (row: T) => string,
  now: Date,
): {title: string; items: T[]}[] {
  const groups: {title: string; items: T[]}[] = [];
  for (const row of rows) {
    const date = new Date(isoOf(row));
    const valid = !Number.isNaN(date.getTime());
    const title = valid
      ? `${MONTH_NAMES[date.getMonth()]}${date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`}`
      : 'Earlier';
    const last = groups[groups.length - 1];
    if (last && last.title === title) {
      last.items.push(row);
    } else {
      groups.push({title, items: [row]});
    }
  }
  return groups;
}
