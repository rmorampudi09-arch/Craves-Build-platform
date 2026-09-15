import {
  CHEF_EARNINGS_MAX_LIMIT,
  normalizeChefEarningsLimit,
  parseChefEarningLedger,
  parseChefEarningLedgerEntry,
} from './chefPayoutApi';

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

describe('chefPayoutApi financial parsing', () => {
  it('parses the exact Chef earning row and canonicalizes money without recomputing it', () => {
    expect(parseChefEarningLedgerEntry(validEntry)).toEqual({
      id: validEntry.id,
      orderId: validEntry.orderId,
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

  it('enforces the exact server-supported 1 to 500 limit boundary', () => {
    expect(normalizeChefEarningsLimit(1)).toBe(1);
    expect(normalizeChefEarningsLimit(CHEF_EARNINGS_MAX_LIMIT)).toBe(500);
    expect(() => normalizeChefEarningsLimit(0)).toThrow();
    expect(() => normalizeChefEarningsLimit(501)).toThrow();
    expect(() => normalizeChefEarningsLimit(2.5)).toThrow();
  });
});
