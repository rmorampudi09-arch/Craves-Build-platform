import type {ChefOperationalNotice, ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {
  ChefDashboardEarning,
  ChefDashboardMenuItem,
} from '../api/chefDashboardApi';
import {
  CHEF_DASHBOARD_CONTRACT_GAPS,
  deriveChefDashboardModel,
} from './chefDashboardModel';

const orders: ChefOperationalOrder[] = [
  {id: '11111111-1111-4111-8111-111111111111', status: 'CHEF_ACCEPTANCE_PENDING'},
  {id: '22222222-2222-4222-8222-222222222222', status: 'PREPARING'},
  {id: '33333333-3333-4333-8333-333333333333', status: 'READY_FOR_PICKUP'},
  {id: '44444444-4444-4444-8444-444444444444', status: 'DELIVERED'},
];

function earning(
  id: string,
  status: ChefDashboardEarning['status'],
  netPayable: number,
  updatedAt: string,
): ChefDashboardEarning {
  return {
    id,
    orderId: '55555555-5555-4555-8555-555555555555',
    orderSource: 'ON_DEMAND',
    currency: 'INR',
    grossAmount: netPayable,
    commissionAmount: 0,
    taxWithheldAmount: 0,
    adjustmentAmount: 0,
    netPayable,
    allocationReference: `ALLOC-${id}`,
    status,
    reason: 'Test allocation',
    approvedAt: status === 'APPROVED' ? updatedAt : null,
    reversedAt: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function menuItem(
  id: string,
  status: ChefDashboardMenuItem['status'],
  available: boolean,
  withImage: boolean,
): ChefDashboardMenuItem {
  return {
    id,
    kitchenId: '00000000-0000-4000-8000-000000000100',
    itemName: `Item ${id}`,
    description: null,
    category: 'MEALS',
    foodType: 'VEG',
    price: 100,
    currency: 'INR',
    servesCount: 1,
    preparationTimeMinutes: 30,
    spiceLevel: 'MILD',
    unitPackageWeightGrams: 500,
    thermoboxRequired: false,
    available,
    status,
    images: withImage
      ? [
          {
            id: '99999999-9999-4999-8999-999999999999',
            menuItemId: id,
            blobContainer: 'menu',
            blobName: 'item.jpg',
            publicUrl: 'https://cdn.example.test/item.jpg',
            sortOrder: 0,
            primary: true,
            contentType: 'image/jpeg',
            fileSizeBytes: 100,
            createdAt: '2026-08-09T07:00:00Z',
          },
        ]
      : [],
    createdAt: '2026-08-09T07:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
  };
}

const notices: ChefOperationalNotice[] = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'Unread',
    body: 'Unread notice',
    noticeType: 'ORDER',
    targetType: 'ORDER',
    targetId: null,
    readAt: null,
    createdAt: '2026-08-09T09:00:00Z',
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    title: 'Read',
    body: 'Read notice',
    noticeType: 'ORDER',
    targetType: 'ORDER',
    targetId: null,
    readAt: '2026-08-09T08:30:00Z',
    createdAt: '2026-08-09T08:00:00Z',
  },
];

describe('deriveChefDashboardModel', () => {
  it('derives only reconciliation-safe summaries from exact records', () => {
    const model = deriveChefDashboardModel({
      orders,
      earnings: [
        earning(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'APPROVED',
          125.5,
          '2026-08-09T08:00:00Z',
        ),
        earning(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          'SETTLEMENT_PENDING',
          40.25,
          '2026-08-09T09:00:00Z',
        ),
        earning(
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'SETTLED',
          300,
          '2026-08-09T07:00:00Z',
        ),
      ],
      menuItems: [
        menuItem('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'ACTIVE', true, true),
        menuItem('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ACTIVE', false, false),
        menuItem('ffffffff-ffff-4fff-8fff-ffffffffffff', 'DRAFT', true, false),
      ],
      notices,
    });

    expect(model.orders).toEqual(
      expect.objectContaining({
        pendingAcceptance: 1,
        activeOrders: 2,
        readyForPickup: 1,
        totalOrders: 4,
      }),
    );
    expect(model.earnings.balances).toEqual([
      {
        currency: 'INR',
        approvedNetPayable: 125.5,
        settlementPendingNetPayable: 40.25,
        settledNetPayable: 300,
      },
    ]);
    expect(model.menu).toEqual({
      totalItems: 3,
      activeItems: 2,
      sellableItems: 1,
      activeItemsWithPublicImage: 1,
    });
    expect(model.notifications.unread).toBe(1);
  });

  it('records missing analytics and payout contracts instead of inventing data', () => {
    const model = deriveChefDashboardModel({
      orders: [],
      earnings: [],
      menuItems: [],
      notices: [],
    });

    expect(model.analytics).toBe(CHEF_DASHBOARD_CONTRACT_GAPS.analytics);
    expect(model.earnings.payoutEligibility).toBe(
      CHEF_DASHBOARD_CONTRACT_GAPS.payoutEligibility,
    );
  });
});
