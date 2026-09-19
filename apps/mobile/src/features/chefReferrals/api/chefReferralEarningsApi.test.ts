import {httpClient} from '../../../core/http/httpClient';
import {
  chefReferralEarningsApi,
  parseChefReferralEarnings,
} from './chefReferralEarningsApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const response = {
  currency: 'INR',
  asOf: '2026-09-19T12:00:00Z',
  creditedPaise: '12000',
  reversedPaise: '2000',
  netRecordedPaise: '10000',
  postingMonth: '2026-09',
  monthlyCapPaise: '150000',
  monthUsedPaise: '25000',
  monthRemainingPaise: '125000',
  monthlyCapReached: false,
  settlementDestination: 'CHEF_EARNINGS',
  withdrawalAvailability: 'CHECK_VERIFIED_CHEF_EARNINGS_BALANCE',
  recentPostings: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      amountPaise: '5000',
      postingMonth: '2026-09',
      postedAt: '2026-09-18T03:30:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      amountPaise: '-1000',
      postingMonth: '2026-09',
      postedAt: '2026-09-19T03:30:00Z',
    },
  ],
};

describe('chefReferralEarningsApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses the exact Chef referral ledger response', () => {
    expect(parseChefReferralEarnings(response)).toEqual(response);
  });

  it('accepts signed recent postings for refund reversals', () => {
    const parsed = parseChefReferralEarnings(response);
    expect(parsed?.recentPostings[1].amountPaise).toBe('-1000');
  });

  it('rejects inconsistent aggregate or monthly-cap math', () => {
    expect(
      parseChefReferralEarnings({
        ...response,
        netRecordedPaise: '9999',
      }),
    ).toBeNull();

    expect(
      parseChefReferralEarnings({
        ...response,
        monthRemainingPaise: '124999',
      }),
    ).toBeNull();

    expect(
      parseChefReferralEarnings({
        ...response,
        monthlyCapReached: true,
      }),
    ).toBeNull();
  });

  it('rejects unexpected identity or internal finance fields', () => {
    expect(
      parseChefReferralEarnings({
        ...response,
        beneficiaryId: 'private',
      }),
    ).toBeNull();

    expect(
      parseChefReferralEarnings({
        ...response,
        recentPostings: [
          {
            ...response.recentPostings[0],
            orderId: 'private',
          },
        ],
      }),
    ).toBeNull();
  });

  it('calls the exact source route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(response);

    await expect(chefReferralEarningsApi.get()).resolves.toEqual(response);

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/referrals/me/chef-earnings',
      {
        signal: undefined,
        dedupeKey: 'chef-referral-earnings',
      },
    );
  });

  it('rejects malformed backend responses', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      ...response,
      settlementDestination: 'CUSTOMER_WALLET',
    });

    await expect(chefReferralEarningsApi.get()).rejects.toThrow(
      'CHEF_REFERRAL_EARNINGS_INVALID_RESPONSE',
    );
  });
});
