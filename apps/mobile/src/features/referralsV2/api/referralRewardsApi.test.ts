import {httpClient} from '../../../core/http/httpClient';
import {
  REFERRAL_OVERVIEW_ROUTE,
  REFERRAL_REWARD_PAGE_SIZE,
  REFERRAL_REWARDS_ROUTE,
  parseReferralOverview,
  parseReferralRewardPage,
  referralRewardsApi,
} from './referralRewardsApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const overview = {
  asOf: '2026-09-19T12:00:00Z',
  currency: 'INR',
  pendingPaise: '2000',
  availablePaise: '1500',
  reservedPaise: '0',
  balanceUpdatedAt: '2026-09-19T11:59:00Z',
  onReviewHold: false,
  levels: [
    {level: 1, netEarnedPaise: '2000'},
    {level: 2, netEarnedPaise: '1200'},
    {level: 3, netEarnedPaise: '800'},
  ],
  downline: [
    {level: 1, members: '2'},
    {level: 2, members: '1'},
  ],
  code: {
    code: '23456789ABCDEFGH',
    link: 'https://craves.in/r/23456789ABCDEFGH',
    qrPath: '/api/v1/referrals/me/code/qr',
  },
  cashout: {
    enabled: false,
    eligible: false,
    reason: 'CASHOUT_DISABLED',
    minimumPaise: '1000',
  },
  spendingEnabled: false,
  policy: {
    revision: '1',
    ratesBps: [200, 120, 80],
    capBps: 400,
    holdDays: 14,
    minimumPaise: '80000',
    customerBonusPaise: '40000',
    inviteeDiscountPaise: '25000',
    unusedShare: 'retain',
  },
};

const rewardPage = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      track: 'UPLINE',
      level: 1,
      amountPaise: '2000',
      reversedPaise: '0',
      netPaise: '2000',
      status: 'CREDITED',
      createdAt: '2026-09-01T10:00:00Z',
      holdUntil: '2026-09-15T10:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      track: 'CUSTOMER',
      level: 0,
      amountPaise: '40000',
      reversedPaise: '10000',
      netPaise: '30000',
      status: 'REVERSED',
      createdAt: '2026-08-01T10:00:00Z',
      holdUntil: '2026-08-15T10:00:00Z',
    },
  ],
  nextCursor: 'MjAyNi0wOC0wMVQxMDowMDowMFp8MTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEx',
};

describe('referralRewardsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts the exact member overview JSON from main', () => {
    expect(parseReferralOverview(overview)).toEqual(overview);
  });

  it('rejects invented overview fields and malformed referral codes', () => {
    expect(parseReferralOverview({...overview, lifetimeEarnings: '999'})).toBeNull();
    expect(
      parseReferralOverview({
        ...overview,
        code: {...overview.code, code: 'NOT-A-REAL-CODE'},
      }),
    ).toBeNull();
  });

  it('accepts exact reward rows and rejects track-level mismatches', () => {
    expect(parseReferralRewardPage(rewardPage)).toEqual(rewardPage);
    expect(
      parseReferralRewardPage({
        ...rewardPage,
        items: [{...rewardPage.items[0], track: 'CUSTOMER', level: 1}],
      }),
    ).toBeNull();
  });

  it('reads overview with no request JSON', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(overview);

    await expect(referralRewardsApi.getOverview()).resolves.toEqual(overview);
    expect(httpClient.get).toHaveBeenCalledWith(REFERRAL_OVERVIEW_ROUTE, {
      signal: undefined,
      dedupeKey: 'referral-rewards:overview',
    });
  });

  it('uses only documented reward pagination query fields', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(rewardPage);

    await expect(
      referralRewardsApi.getRewards(
        'MjAyNi0wOC0wMVQxMDowMDowMFp8MTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEx',
        REFERRAL_REWARD_PAGE_SIZE,
      ),
    ).resolves.toEqual(rewardPage);

    expect(httpClient.get).toHaveBeenCalledWith(
      `${REFERRAL_REWARDS_ROUTE}?limit=25&cursor=MjAyNi0wOC0wMVQxMDowMDowMFp8MTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEx`,
      {
        signal: undefined,
        dedupeKey:
          'referral-rewards:25:MjAyNi0wOC0wMVQxMDowMDowMFp8MTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEx',
      },
    );
  });

  it('rejects page sizes outside the backend 1..100 contract', async () => {
    await expect(referralRewardsApi.getRewards(null, 0)).rejects.toThrow(
      'REFERRAL_INVALID_PAGE_SIZE',
    );
    await expect(referralRewardsApi.getRewards(null, 101)).rejects.toThrow(
      'REFERRAL_INVALID_PAGE_SIZE',
    );
  });
});
