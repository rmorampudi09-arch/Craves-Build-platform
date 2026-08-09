import {
  parseChefDashboardEarnings,
  parseChefDashboardMenuItems,
} from './chefDashboardApi';

const EARNING_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const MENU_ID = '33333333-3333-4333-8333-333333333333';
const IMAGE_ID = '44444444-4444-4444-8444-444444444444';

function earning(overrides: Record<string, unknown> = {}) {
  return {
    id: EARNING_ID,
    orderId: ORDER_ID,
    orderSource: 'ON_DEMAND',
    currency: 'inr',
    grossAmount: 500,
    commissionAmount: 50,
    taxWithheldAmount: 10,
    adjustmentAmount: -5,
    netPayable: 435,
    allocationReference: 'ALLOC-1',
    status: 'APPROVED',
    reason: 'Order earning allocation',
    approvedAt: '2026-08-09T08:00:00Z',
    reversedAt: null,
    createdAt: '2026-08-09T07:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
    ...overrides,
  };
}

function menuItem(overrides: Record<string, unknown> = {}) {
  return {
    id: MENU_ID,
    itemName: 'Home-style meal',
    description: 'Rice, dal and curry',
    category: 'MEALS',
    foodType: 'VEG',
    price: 199,
    currency: 'inr',
    servesCount: 1,
    preparationTimeMinutes: 30,
    spiceLevel: 'MEDIUM',
    unitPackageWeightGrams: 650,
    thermoboxRequired: false,
    available: true,
    status: 'ACTIVE',
    images: [
      {
        id: IMAGE_ID,
        publicUrl: 'https://cdn.example.test/menu.jpg',
        sortOrder: 0,
        primary: true,
        contentType: 'image/jpeg',
        fileSizeBytes: 12345,
      },
    ],
    createdAt: '2026-08-09T07:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
    ...overrides,
  };
}

describe('chefDashboardApi parsing', () => {
  it('accepts the exact earnings ledger shape and normalizes currency', () => {
    expect(parseChefDashboardEarnings([earning()])).toEqual([
      expect.objectContaining({
        id: EARNING_ID,
        currency: 'INR',
        netPayable: 435,
        status: 'APPROVED',
      }),
    ]);
  });

  it('rejects earnings whose server amounts do not reconcile', () => {
    expect(parseChefDashboardEarnings([earning({netPayable: 999})])).toBeNull();
  });

  it('accepts the exact chef menu-item shape', () => {
    expect(parseChefDashboardMenuItems([menuItem()])).toEqual([
      expect.objectContaining({
        id: MENU_ID,
        currency: 'INR',
        status: 'ACTIVE',
        available: true,
      }),
    ]);
  });

  it('fails closed on unsupported menu status', () => {
    expect(
      parseChefDashboardMenuItems([menuItem({status: 'PUBLISHED'})]),
    ).toBeNull();
  });
});
