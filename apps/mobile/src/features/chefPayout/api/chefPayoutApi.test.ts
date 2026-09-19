import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_EARNINGS_MAX_LIMIT,
  CHEF_EARNINGS_ROUTE,
  CHEF_FINANCE_BALANCE_ROUTE,
  chefPayoutApi,
  normalizeChefEarningsLimit,
  parseChefEarningLedger,
  parseChefFinanceBalance,
  parseChefEarningLedgerEntry,
} from './chefPayoutApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const validEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  orderId: '22222222-2222-4222-8222-222222222222',
  chefIdentityId: '33333333-3333-4333-8333-333333333333',
  orderSource: 'ON_DEMAND',
  currency: 'INR',
  grossAmount: 500,
  commissionAmount: 50,
  taxWithheldAmount: 10,
  adjustmentAmount: -5.5,
  netPayable: 434.5,
  allocationReference: 'ALLOC-001',
  status: 'APPROVED',
  reason: 'Approved launch allocation',
  approvedAt: '2026-08-09T12:00:00Z',
  reversedAt: null,
  createdAt: '2026-08-09T11:00:00Z',
  updatedAt: '2026-08-09T12:00:00Z',
};

const balanceResponse = {
  available: '578.88',
  outstanding: '578.88',
  reservedOrPaid: '338.52',
  onHold: false,
  manualRequestUsedToday: true,
  nextManualRequestAt: '2026-09-20T18:30:00Z',
  recentPayouts: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      amount: '338.52',
      mode: 'MANUAL',
      status: 'PAID',
      providerStatus: null,
      transferReference: 'TEST-UTR-001',
      createdAt: '2026-09-19T10:00:00Z',
      payoutChannel: 'CRAVES_MANUAL',
    },
  ],
  executionEnabled: true,
  payoutMode: 'CRAVES_MANUAL',
  accounting: {
    recordedOrders: 1,
    grossFood: '1000.00',
    totalServiceFee: '82.60',
    feeBeforeGst: '70.00',
    feeGst: '12.60',
    withholding: '0.00',
    originalNetEarnings: '917.40',
    recordedPayments: '338.52',
    outstanding: '578.88',
    otherLedgerMovements: '0.00',
    legacyRecords: 0,
  },
};

describe('chefPayoutApi financial parsing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses the exact Chef earning row and canonicalizes money without recomputing it', () => {
    expect(parseChefEarningLedgerEntry(validEntry)).toEqual({
      id: validEntry.id,
      orderId: validEntry.orderId,
      chefIdentityId: validEntry.chefIdentityId,
      orderSource: 'ON_DEMAND',
      currency: 'INR',
      grossAmount: '500.00',
      commissionAmount: '50.00',
      taxWithheldAmount: '10.00',
      adjustmentAmount: '-5.50',
      netPayable: '434.50',
      allocationReference: 'ALLOC-001',
      status: 'APPROVED',
      reason: 'Approved launch allocation',
      approvedAt: '2026-08-09T12:00:00Z',
      reversedAt: null,
      createdAt: '2026-08-09T11:00:00Z',
      updatedAt: '2026-08-09T12:00:00Z',
    });
  });

  it('rejects response fields outside the Java EarningResponse contract', () => {
    expect(
      parseChefEarningLedgerEntry({...validEntry, availableBalance: 434.5}),
    ).toBeNull();
  });

  it('rejects unsupported earning statuses and malformed money', () => {
    expect(
      parseChefEarningLedgerEntry({...validEntry, status: 'PAID'}),
    ).toBeNull();
    expect(
      parseChefEarningLedgerEntry({...validEntry, netPayable: '434.501'}),
    ).toBeNull();
    expect(
      parseChefEarningLedgerEntry({...validEntry, grossAmount: -1}),
    ).toBeNull();
  });

  it('rejects duplicate ledger row ids instead of silently merging financial data', () => {
    expect(parseChefEarningLedger([validEntry, validEntry])).toBeNull();
  });

  it('uses the public OpenAPI limit boundary of 1 to 200', () => {
    expect(normalizeChefEarningsLimit(1)).toBe(1);
    expect(normalizeChefEarningsLimit(CHEF_EARNINGS_MAX_LIMIT)).toBe(200);
    expect(() => normalizeChefEarningsLimit(0)).toThrow();
    expect(() => normalizeChefEarningsLimit(201)).toThrow();
    expect(() => normalizeChefEarningsLimit(2.5)).toThrow();
  });

  it('parses the exact Chef balance and payout-history JSON from main', () => {
    expect(parseChefFinanceBalance(balanceResponse)).toEqual(balanceResponse);
  });

  it('rejects unreconciled accounting or unsupported finance fields', () => {
    expect(
      parseChefFinanceBalance({
        ...balanceResponse,
        accounting: {
          ...balanceResponse.accounting,
          outstanding: '578.87',
        },
      }),
    ).toBeNull();
    expect(
      parseChefFinanceBalance({
        ...balanceResponse,
        bankAccountNumber: 'must-not-be-exposed',
      }),
    ).toBeNull();
  });

  it('reads balance without sending request JSON', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue(balanceResponse);

    await expect(chefPayoutApi.getBalance()).resolves.toEqual(balanceResponse);
    expect(httpClient.get).toHaveBeenCalledWith(CHEF_FINANCE_BALANCE_ROUTE, {
      signal: undefined,
      dedupeKey: 'chef-finance-balance',
    });
  });

  it('sends only the documented limit query and validates the response', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue([validEntry]);

    await expect(chefPayoutApi.listEarnings(200)).resolves.toHaveLength(1);
    expect(httpClient.get).toHaveBeenCalledWith(
      `${CHEF_EARNINGS_ROUTE}?limit=200`,
      {
        signal: undefined,
        dedupeKey: 'chef-earnings:200',
      },
    );
  });
});
