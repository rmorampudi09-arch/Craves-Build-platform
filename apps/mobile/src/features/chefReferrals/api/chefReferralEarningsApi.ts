import {httpClient} from '../../../core/http/httpClient';

export const CHEF_REFERRAL_EARNINGS_AVAILABLE = false;

export interface ChefReferralPosting {
  id: string;
  amountPaise: string;
  postingMonth: string;
  postedAt: string;
}

export interface ChefReferralEarnings {
  currency: 'INR';
  asOf: string;
  creditedPaise: string;
  reversedPaise: string;
  netRecordedPaise: string;
  postingMonth: string;
  monthlyCapPaise: string;
  monthUsedPaise: string;
  monthRemainingPaise: string;
  monthlyCapReached: boolean;
  settlementDestination: 'CHEF_EARNINGS';
  withdrawalAvailability: 'CHECK_VERIFIED_CHEF_EARNINGS_BALANCE';
  recentPostings: ChefReferralPosting[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^-?\d+$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const POSTING_KEYS = new Set([
  'id',
  'amountPaise',
  'postingMonth',
  'postedAt',
]);
const EARNINGS_KEYS = new Set([
  'currency',
  'asOf',
  'creditedPaise',
  'reversedPaise',
  'netRecordedPaise',
  'postingMonth',
  'monthlyCapPaise',
  'monthUsedPaise',
  'monthRemainingPaise',
  'monthlyCapReached',
  'settlementDestination',
  'withdrawalAvailability',
  'recentPostings',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function integerString(
  value: unknown,
  options?: {allowNegative?: boolean},
): string | null {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  if (!options?.allowNegative && parsed < 0) return null;
  return value;
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function parsePosting(value: unknown): ChefReferralPosting | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, POSTING_KEYS)) return null;

  const id =
    typeof raw.id === 'string' && UUID_PATTERN.test(raw.id) ? raw.id : null;
  const amountPaise = integerString(raw.amountPaise, {allowNegative: true});
  const postingMonth =
    typeof raw.postingMonth === 'string' && MONTH_PATTERN.test(raw.postingMonth)
      ? raw.postingMonth
      : null;
  const postedAt = timestamp(raw.postedAt);

  return id && amountPaise !== null && postingMonth && postedAt
    ? {id, amountPaise, postingMonth, postedAt}
    : null;
}

export function parseChefReferralEarnings(
  value: unknown,
): ChefReferralEarnings | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, EARNINGS_KEYS) || !Array.isArray(raw.recentPostings)) {
    return null;
  }

  const asOf = timestamp(raw.asOf);
  const creditedPaise = integerString(raw.creditedPaise);
  const reversedPaise = integerString(raw.reversedPaise);
  const netRecordedPaise = integerString(raw.netRecordedPaise);
  const monthlyCapPaise = integerString(raw.monthlyCapPaise);
  const monthUsedPaise = integerString(raw.monthUsedPaise);
  const monthRemainingPaise = integerString(raw.monthRemainingPaise);
  const postingMonth =
    typeof raw.postingMonth === 'string' && MONTH_PATTERN.test(raw.postingMonth)
      ? raw.postingMonth
      : null;
  const recentPostings = raw.recentPostings.map(parsePosting);

  if (
    raw.currency !== 'INR' ||
    !asOf ||
    creditedPaise === null ||
    reversedPaise === null ||
    netRecordedPaise === null ||
    !postingMonth ||
    monthlyCapPaise === null ||
    monthUsedPaise === null ||
    monthRemainingPaise === null ||
    typeof raw.monthlyCapReached !== 'boolean' ||
    raw.settlementDestination !== 'CHEF_EARNINGS' ||
    raw.withdrawalAvailability !== 'CHECK_VERIFIED_CHEF_EARNINGS_BALANCE' ||
    recentPostings.length > 50 ||
    recentPostings.some(posting => posting === null)
  ) {
    return null;
  }

  const credited = Number(creditedPaise);
  const reversed = Number(reversedPaise);
  const net = Number(netRecordedPaise);
  const cap = Number(monthlyCapPaise);
  const used = Number(monthUsedPaise);
  const remaining = Number(monthRemainingPaise);

  if (
    credited - reversed !== net ||
    used > cap ||
    cap - used !== remaining ||
    raw.monthlyCapReached !== (used >= cap)
  ) {
    return null;
  }

  return {
    currency: 'INR',
    asOf,
    creditedPaise,
    reversedPaise,
    netRecordedPaise,
    postingMonth,
    monthlyCapPaise,
    monthUsedPaise,
    monthRemainingPaise,
    monthlyCapReached: raw.monthlyCapReached,
    settlementDestination: 'CHEF_EARNINGS',
    withdrawalAvailability: 'CHECK_VERIFIED_CHEF_EARNINGS_BALANCE',
    recentPostings: recentPostings as ChefReferralPosting[],
  };
}

export const chefReferralEarningsApi = {
  async get(signal?: AbortSignal): Promise<ChefReferralEarnings> {
    const response = await httpClient.get<unknown>(
      '/api/v1/referrals/me/chef-earnings',
      {
        signal,
        dedupeKey: 'chef-referral-earnings',
      },
    );
    const parsed = parseChefReferralEarnings(response);
    if (!parsed) {
      throw new Error('CHEF_REFERRAL_EARNINGS_INVALID_RESPONSE');
    }
    return parsed;
  },
};
