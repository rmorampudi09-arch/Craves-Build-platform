import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{16}$/;
const PAISE_PATTERN = /^-?[0-9]{1,13}$/;
const NON_NEGATIVE_PAISE_PATTERN = /^[0-9]{1,13}$/;
const INTEGER_STRING_PATTERN = /^[0-9]{1,19}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;

// Referral Service is deployed privately on current main and its public/member
// gateway publication is not enabled yet. Keep mobile fail-closed until APIM is published.
export const REFERRAL_REWARDS_AVAILABLE = false;

export const REFERRAL_OVERVIEW_ROUTE = '/api/v1/referrals/me' as const;
export const REFERRAL_REWARDS_ROUTE =
  '/api/v1/referrals/me/rewards' as const;
export const REFERRAL_REWARD_PAGE_SIZE = 25;

export type ReferralRewardTrack = 'UPLINE' | 'CUSTOMER';
export type ReferralRewardStatus =
  | 'PENDING'
  | 'CREDITED'
  | 'CANCELLED'
  | 'REVERSED';

export interface ReferralCode {
  code: string;
  link: string;
  qrPath: '/api/v1/referrals/me/code/qr';
}

export interface ReferralLevelEarning {
  level: 1 | 2 | 3;
  netEarnedPaise: string;
}

export interface ReferralDownlineLevel {
  level: 1 | 2 | 3;
  members: string;
}

export interface ReferralCashoutSummary {
  enabled: boolean;
  eligible: boolean;
  reason: string;
  minimumPaise: string;
}

export interface ReferralPolicy {
  revision: string;
  ratesBps: [number, number, number];
  capBps: number;
  holdDays: number;
  minimumPaise: string;
  customerBonusPaise: string;
  inviteeDiscountPaise: string;
  unusedShare: 'retain';
}

export interface ReferralOverview {
  asOf: string;
  currency: 'INR';
  pendingPaise: string;
  availablePaise: string;
  reservedPaise: string;
  balanceUpdatedAt: string;
  onReviewHold: boolean;
  levels: ReferralLevelEarning[];
  downline: ReferralDownlineLevel[];
  code: ReferralCode;
  cashout: ReferralCashoutSummary;
  spendingEnabled: boolean;
  policy: ReferralPolicy | null;
}

export interface ReferralReward {
  id: string;
  track: ReferralRewardTrack;
  level: 0 | 1 | 2 | 3;
  amountPaise: string;
  reversedPaise: string;
  netPaise: string;
  status: ReferralRewardStatus;
  createdAt: string;
  holdUntil: string;
}

export interface ReferralRewardPage {
  items: ReferralReward[];
  nextCursor: string | null;
}

const OVERVIEW_KEYS = new Set([
  'asOf',
  'currency',
  'pendingPaise',
  'availablePaise',
  'reservedPaise',
  'balanceUpdatedAt',
  'onReviewHold',
  'levels',
  'downline',
  'code',
  'cashout',
  'spendingEnabled',
  'policy',
]);
const CODE_KEYS = new Set(['code', 'link', 'qrPath']);
const LEVEL_KEYS = new Set(['level', 'netEarnedPaise']);
const DOWNLINE_KEYS = new Set(['level', 'members']);
const CASHOUT_KEYS = new Set([
  'enabled',
  'eligible',
  'reason',
  'minimumPaise',
]);
const POLICY_KEYS = new Set([
  'revision',
  'ratesBps',
  'capBps',
  'holdDays',
  'minimumPaise',
  'customerBonusPaise',
  'inviteeDiscountPaise',
  'unusedShare',
]);
const REWARD_PAGE_KEYS = new Set(['items', 'nextCursor']);
const REWARD_KEYS = new Set([
  'id',
  'track',
  'level',
  'amountPaise',
  'reversedPaise',
  'netPaise',
  'status',
  'createdAt',
  'holdUntil',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function instant(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function paise(value: unknown, signed = false): string | null {
  if (typeof value !== 'string') return null;
  return (signed ? PAISE_PATTERN : NON_NEGATIVE_PAISE_PATTERN).test(value)
    ? value
    : null;
}

function smallInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function parseCode(value: unknown): ReferralCode | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, CODE_KEYS)) return null;
  if (
    typeof raw.code !== 'string' ||
    !CODE_PATTERN.test(raw.code) ||
    typeof raw.link !== 'string' ||
    raw.link.length > 500 ||
    !raw.link.startsWith('https://') ||
    raw.qrPath !== '/api/v1/referrals/me/code/qr'
  ) {
    return null;
  }
  return {
    code: raw.code,
    link: raw.link,
    qrPath: raw.qrPath,
  };
}

function parseLevel(value: unknown): ReferralLevelEarning | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, LEVEL_KEYS)) return null;
  const level = smallInteger(raw.level, 1, 3) as 1 | 2 | 3 | null;
  const netEarnedPaise = paise(raw.netEarnedPaise, true);
  return level && netEarnedPaise !== null
    ? {level, netEarnedPaise}
    : null;
}

function parseDownline(value: unknown): ReferralDownlineLevel | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, DOWNLINE_KEYS)) return null;
  const level = smallInteger(raw.level, 1, 3) as 1 | 2 | 3 | null;
  const members =
    typeof raw.members === 'string' && INTEGER_STRING_PATTERN.test(raw.members)
      ? raw.members
      : null;
  return level && members !== null ? {level, members} : null;
}

function parseCashout(value: unknown): ReferralCashoutSummary | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, CASHOUT_KEYS)) return null;
  const minimumPaise = paise(raw.minimumPaise);
  if (
    typeof raw.enabled !== 'boolean' ||
    typeof raw.eligible !== 'boolean' ||
    typeof raw.reason !== 'string' ||
    !raw.reason ||
    raw.reason.length > 100 ||
    minimumPaise === null
  ) {
    return null;
  }
  return {
    enabled: raw.enabled,
    eligible: raw.eligible,
    reason: raw.reason,
    minimumPaise,
  };
}

function parsePolicy(value: unknown): ReferralPolicy | null | undefined {
  if (value == null) return null;
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, POLICY_KEYS)) return undefined;

  const revision =
    typeof raw.revision === 'string' && INTEGER_STRING_PATTERN.test(raw.revision)
      ? raw.revision
      : null;
  const minimumPaise = paise(raw.minimumPaise);
  const customerBonusPaise = paise(raw.customerBonusPaise);
  const inviteeDiscountPaise = paise(raw.inviteeDiscountPaise);
  if (
    revision === null ||
    !Array.isArray(raw.ratesBps) ||
    raw.ratesBps.length !== 3 ||
    raw.ratesBps.some(rate => smallInteger(rate, 0, 400) === null) ||
    smallInteger(raw.capBps, 1, 400) === null ||
    smallInteger(raw.holdDays, 1, 365) === null ||
    minimumPaise === null ||
    customerBonusPaise === null ||
    inviteeDiscountPaise === null ||
    raw.unusedShare !== 'retain'
  ) {
    return undefined;
  }

  return {
    revision,
    ratesBps: raw.ratesBps as [number, number, number],
    capBps: raw.capBps as number,
    holdDays: raw.holdDays as number,
    minimumPaise,
    customerBonusPaise,
    inviteeDiscountPaise,
    unusedShare: 'retain',
  };
}

export function parseReferralOverview(value: unknown): ReferralOverview | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, OVERVIEW_KEYS)) return null;

  const asOf = instant(raw.asOf);
  const pendingPaise = paise(raw.pendingPaise);
  const availablePaise = paise(raw.availablePaise, true);
  const reservedPaise = paise(raw.reservedPaise);
  const balanceUpdatedAt = instant(raw.balanceUpdatedAt);
  const code = parseCode(raw.code);
  const cashout = parseCashout(raw.cashout);
  const policy = parsePolicy(raw.policy);

  if (
    !asOf ||
    raw.currency !== 'INR' ||
    pendingPaise === null ||
    availablePaise === null ||
    reservedPaise === null ||
    !balanceUpdatedAt ||
    typeof raw.onReviewHold !== 'boolean' ||
    typeof raw.spendingEnabled !== 'boolean' ||
    !Array.isArray(raw.levels) ||
    raw.levels.length !== 3 ||
    !Array.isArray(raw.downline) ||
    raw.downline.length > 3 ||
    !code ||
    !cashout ||
    policy === undefined
  ) {
    return null;
  }

  const levels = raw.levels.map(parseLevel);
  const downline = raw.downline.map(parseDownline);
  if (
    levels.some(item => item === null) ||
    downline.some(item => item === null)
  ) {
    return null;
  }

  const typedLevels = levels as ReferralLevelEarning[];
  const typedDownline = downline as ReferralDownlineLevel[];
  if (
    new Set(typedLevels.map(item => item.level)).size !== typedLevels.length ||
    new Set(typedDownline.map(item => item.level)).size !== typedDownline.length
  ) {
    return null;
  }

  return {
    asOf,
    currency: 'INR',
    pendingPaise,
    availablePaise,
    reservedPaise,
    balanceUpdatedAt,
    onReviewHold: raw.onReviewHold,
    levels: typedLevels,
    downline: typedDownline,
    code,
    cashout,
    spendingEnabled: raw.spendingEnabled,
    policy,
  };
}

function parseReward(value: unknown): ReferralReward | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, REWARD_KEYS)) return null;

  const id =
    typeof raw.id === 'string' && UUID_PATTERN.test(raw.id) ? raw.id : null;
  const track =
    raw.track === 'UPLINE' || raw.track === 'CUSTOMER' ? raw.track : null;
  const level = smallInteger(raw.level, 0, 3) as 0 | 1 | 2 | 3 | null;
  const amountPaise = paise(raw.amountPaise);
  const reversedPaise = paise(raw.reversedPaise);
  const netPaise = paise(raw.netPaise, true);
  const status =
    raw.status === 'PENDING' ||
    raw.status === 'CREDITED' ||
    raw.status === 'CANCELLED' ||
    raw.status === 'REVERSED'
      ? raw.status
      : null;
  const createdAt = instant(raw.createdAt);
  const holdUntil = instant(raw.holdUntil);

  if (
    !id ||
    !track ||
    level === null ||
    amountPaise === null ||
    reversedPaise === null ||
    netPaise === null ||
    !status ||
    !createdAt ||
    !holdUntil ||
    (track === 'CUSTOMER' && level !== 0) ||
    (track === 'UPLINE' && (level < 1 || level > 3))
  ) {
    return null;
  }

  return {
    id,
    track,
    level,
    amountPaise,
    reversedPaise,
    netPaise,
    status,
    createdAt,
    holdUntil,
  };
}

export function parseReferralRewardPage(
  value: unknown,
): ReferralRewardPage | null {
  const raw = asRecord(value);
  if (
    !raw ||
    !exactKeys(raw, REWARD_PAGE_KEYS) ||
    !Array.isArray(raw.items) ||
    raw.items.length > 100
  ) {
    return null;
  }

  const items = raw.items.map(parseReward);
  const nextCursor =
    raw.nextCursor == null
      ? null
      : typeof raw.nextCursor === 'string' &&
          CURSOR_PATTERN.test(raw.nextCursor)
        ? raw.nextCursor
        : undefined;

  if (
    items.some(item => item === null) ||
    nextCursor === undefined ||
    new Set((items as ReferralReward[]).map(item => item.id)).size !==
      items.length
  ) {
    return null;
  }

  return {items: items as ReferralReward[], nextCursor};
}

function requireOverview(value: unknown): ReferralOverview {
  const parsed = parseReferralOverview(value);
  if (!parsed) throw new Error('REFERRAL_OVERVIEW_INVALID_RESPONSE');
  return parsed;
}

function requireRewardPage(value: unknown): ReferralRewardPage {
  const parsed = parseReferralRewardPage(value);
  if (!parsed) throw new Error('REFERRAL_REWARDS_INVALID_RESPONSE');
  return parsed;
}

export const referralRewardsApi = {
  async getOverview(signal?: AbortSignal): Promise<ReferralOverview> {
    return requireOverview(
      await httpClient.get<unknown>(REFERRAL_OVERVIEW_ROUTE, {
        signal,
        dedupeKey: 'referral-rewards:overview',
      }),
    );
  },

  async getRewards(
    cursor?: string | null,
    limit = REFERRAL_REWARD_PAGE_SIZE,
    signal?: AbortSignal,
  ): Promise<ReferralRewardPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('REFERRAL_INVALID_PAGE_SIZE');
    }
    if (cursor != null && !CURSOR_PATTERN.test(cursor)) {
      throw new Error('REFERRAL_INVALID_PAGE_CURSOR');
    }

    const query = cursor
      ? `limit=${limit}&cursor=${encodeURIComponent(cursor)}`
      : `limit=${limit}`;
    return requireRewardPage(
      await httpClient.get<unknown>(
        `${REFERRAL_REWARDS_ROUTE}?${query}`,
        {
          signal,
          dedupeKey: `referral-rewards:${limit}:${cursor ?? 'first'}`,
        },
      ),
    );
  },
};
